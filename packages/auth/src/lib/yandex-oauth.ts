import { env } from "../env";

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
 * in a short-lived in-memory map keyed by the Yandex account id and drain it
 * from the `account.create.after` database hook in `server.ts`.
 *
 * @see https://yandex.ru/dev/id/doc/en/codes/code-url
 * @see https://yandex.ru/dev/id/doc/en/user-information
 */

export const YANDEX_PROVIDER_ID = "yandex";

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
	capturedAt: number;
}

/**
 * Transient handoff between `mapProfileToUser` and the `account.create.after`
 * hook, keyed by Yandex account id. Entries are short-lived (drained on the
 * immediately-following account insert) and self-expire to avoid unbounded
 * growth if a flow is abandoned mid-handshake.
 */
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingProfiles = new Map<string, PendingYandexProfile>();

function prunePending(now: number): void {
	for (const [key, value] of pendingProfiles) {
		if (now - value.capturedAt > PENDING_TTL_MS) {
			pendingProfiles.delete(key);
		}
	}
}

/** Drain (read-and-delete) the pending Yandex profile for an account id. */
export function takePendingYandexProfile(
	accountId: string,
): PendingYandexProfile | undefined {
	const entry = pendingProfiles.get(accountId);
	if (entry) {
		pendingProfiles.delete(accountId);
	}
	return entry;
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
 * Map a Yandex `userinfo` payload onto better-auth user fields and stash the
 * provider identity for the `account.create.after` hook.
 */
function mapYandexProfileToUser(profile: Record<string, unknown>): {
	name: string;
	email: string;
	image?: string;
} {
	const info = profile as unknown as YandexUserInfo;
	const avatarUrl = yandexAvatarUrl(
		info.default_avatar_id,
		info.is_avatar_empty,
	);
	const login = info.login ?? null;

	pendingProfiles.set(info.id, {
		displayUsername: login,
		providerAvatarUrl: avatarUrl,
		capturedAt: Date.now(),
	});
	prunePending(Date.now());

	const name =
		info.display_name?.trim() ||
		info.real_name?.trim() ||
		info.login ||
		"Yandex User";
	const email = info.default_email ?? info.emails?.[0] ?? "";

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
