import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Telegram Login Widget payload verification (ROX-522).
 *
 * Telegram signs the login payload so the receiving server can prove it came
 * from Telegram and was not tampered with. The algorithm
 * (https://core.telegram.org/widgets/login#checking-authorization):
 *
 *   secret_key       = SHA256(<bot_token>)
 *   data_check_string = join(sorted("<key>=<value>" for each field except hash), "\n")
 *   expected_hash    = HMAC_SHA256(data_check_string, secret_key)  // hex
 *
 * The widget is accepted only when `expected_hash === hash` and the payload is
 * fresh (`auth_date` within `maxAgeSeconds`), which defends against replay.
 */

export interface TelegramLoginPayload {
	id: string;
	first_name?: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	auth_date: string;
	hash: string;
}

export interface VerifiedTelegramUser {
	id: string;
	firstName: string | null;
	lastName: string | null;
	username: string | null;
	photoUrl: string | null;
	authDate: number;
}

export type TelegramVerifyResult =
	| { ok: true; user: VerifiedTelegramUser }
	| { ok: false; reason: "missing_fields" | "bad_hash" | "expired" };

/**
 * Default freshness window for a login payload: 300 seconds.
 *
 * Telegram signs the widget payload at login time; a legitimate browser posts
 * it to our callback within a second or two, but slow networks, OAuth redirects,
 * and clock skew between Telegram and our servers can push a legitimate payload
 * past a tight 60s window and cause spurious login failures. A 300s window keeps
 * the replay surface small while tolerating real-world latency. The callback
 * additionally enforces single-use via KV so a payload can't be replayed even
 * inside this window.
 */
export const TELEGRAM_DEFAULT_MAX_AGE_SECONDS = 300;

const TELEGRAM_FIELDS = [
	"id",
	"first_name",
	"last_name",
	"username",
	"photo_url",
	"auth_date",
] as const;

/**
 * Build the canonical `data_check_string`: every received field except `hash`,
 * sorted by key, joined as `key=value` with newlines.
 */
function buildDataCheckString(params: Record<string, string>): string {
	return Object.keys(params)
		.filter((key) => key !== "hash")
		.sort()
		.map((key) => `${key}=${params[key]}`)
		.join("\n");
}

function safeHexEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
	} catch {
		return false;
	}
}

/**
 * Verify a Telegram Login Widget payload against the bot token.
 *
 * @param rawParams  All query/body params received from the widget (string map).
 * @param botToken   `TELEGRAM_BOT_TOKEN` — never logged.
 * @param maxAgeSeconds  Reject payloads older than this (replay defense).
 */
export function verifyTelegramLogin(
	rawParams: Record<string, string | undefined>,
	botToken: string,
	maxAgeSeconds: number = TELEGRAM_DEFAULT_MAX_AGE_SECONDS,
): TelegramVerifyResult {
	const hash = rawParams.hash;
	const id = rawParams.id;
	const authDateRaw = rawParams.auth_date;
	if (!hash || !id || !authDateRaw) {
		return { ok: false, reason: "missing_fields" };
	}

	// Only sign over the known Telegram fields that are actually present. Extra
	// params (e.g. a CSRF/state value we add ourselves) must NOT enter the
	// data-check-string, or the hash would never match Telegram's.
	const checkParams: Record<string, string> = {};
	for (const field of TELEGRAM_FIELDS) {
		const value = rawParams[field];
		if (value !== undefined) {
			checkParams[field] = value;
		}
	}

	const secretKey = createHash("sha256").update(botToken).digest();
	const dataCheckString = buildDataCheckString(checkParams);
	const expectedHash = createHmac("sha256", secretKey)
		.update(dataCheckString)
		.digest("hex");

	if (!safeHexEqual(expectedHash, hash)) {
		return { ok: false, reason: "bad_hash" };
	}

	const authDate = Number.parseInt(authDateRaw, 10);
	if (!Number.isFinite(authDate)) {
		return { ok: false, reason: "missing_fields" };
	}
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (nowSeconds - authDate > maxAgeSeconds) {
		return { ok: false, reason: "expired" };
	}

	return {
		ok: true,
		user: {
			id,
			firstName: rawParams.first_name ?? null,
			lastName: rawParams.last_name ?? null,
			username: rawParams.username ?? null,
			photoUrl: rawParams.photo_url ?? null,
			authDate,
		},
	};
}
