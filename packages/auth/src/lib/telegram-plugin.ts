import { createHash } from "node:crypto";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { env } from "../env";
import { kv } from "./kv";
import { upsertSocialProfile } from "./social-profile";
import {
	TELEGRAM_DEFAULT_MAX_AGE_SECONDS,
	verifyTelegramLogin,
} from "./telegram-login";

/**
 * Telegram Login Widget as a first-class better-auth plugin (ROX-522).
 *
 * Telegram login is NOT OAuth2, so it can't go through `genericOAuth`. Instead
 * the widget posts a signed payload to `GET /api/auth/telegram/callback`. We:
 *   1. verify the HMAC signature + freshness (`verifyTelegramLogin`),
 *   2. find-or-create a better-auth user keyed by the Telegram id (stored in
 *      `auth.accounts` as providerId="telegram", accountId=<tg id>),
 *   3. denormalize the provider identity onto `user_profiles`,
 *   4. create a session + set the session cookie (reusing better-auth's own
 *      `internalAdapter.createSession` + `setSessionCookie`, exactly like the
 *      magic-link / anonymous plugins), then
 *   5. redirect back into the app.
 *
 * Mounting this inside the better-auth handler (rather than a standalone Next
 * route) means it inherits trustedOrigins, the cross-subdomain cookie config,
 * rate limiting and CSRF handling for free.
 */

export const TELEGRAM_PROVIDER_ID = "telegram";

/**
 * KV key for the single-use replay guard. Keyed by the SHA-256 of the payload
 * `hash` (the per-login HMAC signature) so a verified payload can be redeemed
 * exactly once. We hash the signature again rather than store it raw to avoid
 * persisting the credential material verbatim.
 */
function telegramUsedKey(payloadHash: string): string {
	const digest = createHash("sha256").update(payloadHash).digest("hex");
	return `tg:used:${digest}`;
}

/** Telegram never supplies an email; mint a stable synthetic one per tg id. */
function telegramSyntheticEmail(telegramId: string): string {
	return `telegram_${telegramId}@telegram.rox.local`;
}

function telegramDisplayName(
	firstName: string | null,
	lastName: string | null,
	username: string | null,
): string {
	const full = [firstName, lastName].filter(Boolean).join(" ").trim();
	return full || username || "Telegram User";
}

const TelegramCallbackQuerySchema = z.object({
	id: z.string(),
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	username: z.string().optional(),
	photo_url: z.string().optional(),
	auth_date: z.string(),
	hash: z.string(),
	/** Optional post-login redirect target (validated against trusted origins). */
	callbackURL: z.string().optional(),
});

/**
 * better-auth plugin exposing `GET /telegram/callback`. Returns `null`-safe:
 * if `TELEGRAM_BOT_TOKEN` is unset the endpoint responds 503 so the rest of
 * auth keeps working in environments without Telegram configured.
 */
export function telegramLogin() {
	return {
		id: "telegram-login",
		endpoints: {
			telegramCallback: createAuthEndpoint(
				"/telegram/callback",
				{
					method: "GET",
					query: TelegramCallbackQuerySchema,
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Telegram Login Widget callback",
							responses: {
								302: { description: "Redirect into the app on success" },
							},
						},
					},
				},
				async (ctx) => {
					const botToken = env.TELEGRAM_BOT_TOKEN;
					const webUrl = env.NEXT_PUBLIC_WEB_URL;
					const signInUrl = `${webUrl}/sign-in`;
					// Single generic error for all client-visible failures: don't leak
					// whether a payload was malformed, stale, or had a bad signature
					// (would otherwise be a verification oracle). The specific reason is
					// logged server-side only.
					const failureRedirect = `${signInUrl}?error=telegram_failed`;

					if (!botToken) {
						ctx.context.logger.error(
							"[telegram-login] TELEGRAM_BOT_TOKEN is not configured",
						);
						throw ctx.redirect(failureRedirect);
					}

					const verification = verifyTelegramLogin(
						ctx.query,
						botToken,
						TELEGRAM_DEFAULT_MAX_AGE_SECONDS,
					);
					if (!verification.ok) {
						ctx.context.logger.warn(
							`[telegram-login] payload rejected: ${verification.reason}`,
						);
						throw ctx.redirect(failureRedirect);
					}

					const tg = verification.user;
					const adapter = ctx.context.internalAdapter;

					// Single-use replay guard: a verified payload may be redeemed exactly
					// once, even within the freshness window. Atomically claim the key
					// (SET NX) with a TTL equal to the freshness window — once the payload
					// can no longer be fresh, the guard key is irrelevant and self-expires.
					// `set(..., { nx: true })` returns null when the key already exists.
					const usedKey = telegramUsedKey(ctx.query.hash);
					try {
						const claimed = await kv.set(usedKey, "1", {
							nx: true,
							ex: TELEGRAM_DEFAULT_MAX_AGE_SECONDS,
						});
						if (claimed === null) {
							ctx.context.logger.warn(
								"[telegram-login] payload rejected: replay (already used)",
							);
							throw ctx.redirect(failureRedirect);
						}
					} catch (error) {
						// A redirect surfaces as a thrown APIError — re-throw so it isn't
						// swallowed as a KV failure.
						if (error instanceof Error && error.name === "APIError")
							throw error;
						// KV is the replay backstop; if it's unreachable, fail closed rather
						// than allow an unguarded (replayable) sign-in.
						ctx.context.logger.error(
							"[telegram-login] replay-guard KV write failed",
							error,
						);
						throw ctx.redirect(failureRedirect);
					}

					// Resolve the post-login redirect. Only honor a same-origin web URL
					// to avoid open-redirect; default to the web app root.
					let callbackURL = webUrl;
					if (ctx.query.callbackURL) {
						try {
							const candidate = new URL(ctx.query.callbackURL, webUrl);
							const base = new URL(webUrl);
							if (candidate.origin === base.origin) {
								callbackURL = candidate.toString();
							}
						} catch {
							// fall through to default
						}
					}

					let userId: string | null = null;

					const existingAccount = await adapter.findAccountByProviderId(
						tg.id,
						TELEGRAM_PROVIDER_ID,
					);

					if (existingAccount) {
						userId = existingAccount.userId;
					} else {
						const displayName = telegramDisplayName(
							tg.firstName,
							tg.lastName,
							tg.username,
						);
						const { user: createdUser } = await adapter.createOAuthUser(
							{
								email: telegramSyntheticEmail(tg.id),
								emailVerified: false,
								name: displayName,
								...(tg.photoUrl ? { image: tg.photoUrl } : {}),
							},
							{
								providerId: TELEGRAM_PROVIDER_ID,
								accountId: tg.id,
							},
						);
						userId = createdUser.id;

						// First-touch provider identity on user_profiles. Best-effort:
						// a profile write must never block sign-in.
						try {
							await upsertSocialProfile({
								userId: createdUser.id,
								registrationProvider: "telegram",
								providerAccountId: tg.id,
								displayUsername: tg.username ?? tg.firstName,
								providerAvatarUrl: tg.photoUrl,
							});
						} catch (error) {
							ctx.context.logger.error(
								"[telegram-login] failed to write user_profiles",
								error,
							);
						}
					}

					if (!userId) {
						throw ctx.redirect(`${signInUrl}?error=telegram_user_failed`);
					}

					const user = await adapter.findUserById(userId);
					if (!user) {
						throw ctx.redirect(`${signInUrl}?error=telegram_user_missing`);
					}

					const session = await adapter.createSession(user.id, false);
					if (!session) {
						throw ctx.redirect(`${signInUrl}?error=telegram_session_failed`);
					}

					await setSessionCookie(ctx, { session, user });

					throw ctx.redirect(callbackURL);
				},
			),
		},
	};
}
