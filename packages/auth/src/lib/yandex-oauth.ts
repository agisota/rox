import { env } from "../env";
import { kv } from "./kv";

/**
 * Yandex ID OAuth2 (ROX-522).
 *
 * Wired through better-auth's `genericOAuth` plugin. The OAuth dance, token
 * exchange, account row and base user creation are all handled by the plugin;
 * this module only:
 *  1. shapes the provider config (endpoints, scopes, redirect URI), and
 *  2. maps the Yandex `userinfo` payload onto the better-auth user
 *     (`name` / `email` / `image`).
 *
 * The cached provider identity for `user_profiles` (registration_provider,
 * provider_account_id, display_username, provider_avatar_url) can't be written
 * from `mapProfileToUser` (it may only return `Partial<User>`), so we stash it
 * in durable KV keyed by the Yandex account id and drain it (read-and-delete)
 * from the `account.create.after` database hook in `server.ts`. KV — not a
 * process-local Map — because the OAuth callback that runs `mapProfileToUser`
 * and the `account.create.after` hook may execute in different serverless
 * instances, where an in-memory handoff would silently lose the profile.
 *
 * @see https://yandex.ru/dev/id/doc/en/codes/code-url
 * @see https://yandex.ru/dev/id/doc/en/user-information
 */

export const YANDEX_PROVIDER_ID = "yandex";

/** KV key for the transient profile handoff, keyed by Yandex account id. */
function yandexPendingKey(accountId: string): string {
	return `yandex:pending:${accountId}`;
}

/** TTL for the pending-profile handoff (seconds). Drained on the account insert. */
const YANDEX_PENDING_TTL_SECONDS = 300;

/** Yandex `userinfo` response (the fields we consume). */
interface YandexUserInfo {
	id: string;
	login?: string;
	display_name?: string;
	real_name?: string;
	default_email?: string;
	emails?: string[];
	default_avatar_id?: string;
	is_avatar_empty?: boolean;
}

/** Provider identity to denormalize onto `user_profiles` once the account exists. */
export interface PendingYandexProfile {
	displayUsername: string | null;
	providerAvatarUrl: string | null;
}

/** Stash the pending Yandex profile in KV with a short TTL (read-and-delete on insert). */
async function putPendingYandexProfile(
	accountId: string,
	profile: PendingYandexProfile,
): Promise<void> {
	await kv.set(yandexPendingKey(accountId), profile, {
		ex: YANDEX_PENDING_TTL_SECONDS,
	});
}

/**
 * Drain (read-and-delete) the pending Yandex profile for an account id from KV.
 * Uses GETDEL so the handoff is consumed atomically and never re-read.
 */
export async function takePendingYandexProfile(
	accountId: string,
): Promise<PendingYandexProfile | null> {
	return kv.getdel<PendingYandexProfile>(yandexPendingKey(accountId));
}

/**
 * Build the Yandex avatar URL from `default_avatar_id`. Yandex serves several
 * sizes; `islands-200` is a square 200px crop suitable for avatars. Returns
 * `null` when the user has no avatar.
 */
function yandexAvatarUrl(
	avatarId: string | undefined,
	isEmpty: boolean | undefined,
): string | null {
	if (!avatarId || isEmpty) return null;
	return `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`;
}

/**
 * Yandex never guarantees an email (the `login:email` scope can be declined, or
 * a phone-only account has none). Minting a user with `email=""` would collide
 * on the unique email index and let unrelated email-less Yandex accounts merge.
 * Synthesize a stable, unique placeholder per Yandex id instead — mirroring the
 * Telegram synthetic-email pattern — so the account is still resilient and
 * uniquely keyed. The user can attach a real email later.
 */
function yandexSyntheticEmail(yandexId: string): string {
	return `yandex_${yandexId}@yandex.rox.local`;
}

/**
 * Map a Yandex `userinfo` payload onto better-auth user fields and stash the
 * provider identity in KV for the `account.create.after` hook. Async because the
 * KV write must complete before the account row (and its hook) is created.
 */
async function mapYandexProfileToUser(
	profile: Record<string, unknown>,
): Promise<{
	name: string;
	email: string;
	image?: string;
}> {
	const info = profile as unknown as YandexUserInfo;
	const avatarUrl = yandexAvatarUrl(
		info.default_avatar_id,
		info.is_avatar_empty,
	);
	const login = info.login ?? null;

	await putPendingYandexProfile(info.id, {
		displayUsername: login,
		providerAvatarUrl: avatarUrl,
	});

	const name =
		info.display_name?.trim() ||
		info.real_name?.trim() ||
		info.login ||
		"Yandex User";
	const email =
		info.default_email ?? info.emails?.[0] ?? yandexSyntheticEmail(info.id);

	return {
		name,
		email,
		...(avatarUrl ? { image: avatarUrl } : {}),
	};
}

/**
 * The `genericOAuth` provider config for Yandex. Returns `null` when Yandex
 * credentials are not configured so the plugin can be registered with an empty
 * provider list in environments without RU social login.
 */
export function buildYandexProvider() {
	const clientId = env.YANDEX_CLIENT_ID;
	const clientSecret = env.YANDEX_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;

	return {
		providerId: YANDEX_PROVIDER_ID,
		clientId,
		clientSecret,
		authorizationUrl: "https://oauth.yandex.ru/authorize",
		tokenUrl: "https://oauth.yandex.ru/token",
		userInfoUrl: "https://login.yandex.ru/info?format=json",
		scopes: ["login:info", "login:avatar", "login:email"],
		// MUST match the redirect URI registered in the Yandex OAuth app exactly.
		// genericOAuth's own default resolves to the same value
		// (`${baseURL}/oauth2/callback/yandex`, baseURL already includes the
		// `/api/auth` basePath), but we set it explicitly so the contract is
		// pinned in code and immune to any basePath/default drift.
		redirectURI: `${env.NEXT_PUBLIC_API_URL}/api/auth/oauth2/callback/yandex`,
		mapProfileToUser: mapYandexProfileToUser,
	};
}
