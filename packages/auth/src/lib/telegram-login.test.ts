import { describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import {
	TELEGRAM_DEFAULT_MAX_AGE_SECONDS,
	verifyTelegramLogin,
} from "./telegram-login";

const BOT_TOKEN = "123456:test-bot-token";

/**
 * Build a correctly-signed Telegram Login Widget payload for the given fields,
 * mirroring Telegram's own algorithm (secret_key = SHA256(token); hash =
 * HMAC_SHA256(data_check_string, secret_key)).
 */
function signPayload(
	fields: Record<string, string>,
	token = BOT_TOKEN,
): Record<string, string> {
	const dataCheckString = Object.keys(fields)
		.sort()
		.map((key) => `${key}=${fields[key]}`)
		.join("\n");
	const secretKey = createHash("sha256").update(token).digest();
	const hash = createHmac("sha256", secretKey)
		.update(dataCheckString)
		.digest("hex");
	return { ...fields, hash };
}

function freshAuthDate(): string {
	return String(Math.floor(Date.now() / 1000));
}

describe("TELEGRAM_DEFAULT_MAX_AGE_SECONDS", () => {
	it("is a tight 60-second replay window (ROX-522 hardening)", () => {
		expect(TELEGRAM_DEFAULT_MAX_AGE_SECONDS).toBe(60);
	});
});

describe("verifyTelegramLogin", () => {
	it("accepts a correctly-signed, fresh payload", () => {
		const payload = signPayload({
			id: "42",
			first_name: "Mark",
			username: "mark",
			auth_date: freshAuthDate(),
		});

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.user.id).toBe("42");
			expect(result.user.username).toBe("mark");
			expect(result.user.firstName).toBe("Mark");
		}
	});

	it("rejects a tampered payload (wrong hash)", () => {
		const payload = signPayload({
			id: "42",
			first_name: "Mark",
			auth_date: freshAuthDate(),
		});
		// Tamper with a signed field after the hash was computed.
		payload.id = "9999";

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("bad_hash");
	});

	it("rejects a payload signed with a different bot token", () => {
		const payload = signPayload(
			{ id: "42", auth_date: freshAuthDate() },
			"999:other-token",
		);

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("bad_hash");
	});

	it("rejects a stale payload (auth_date too old)", () => {
		const stale = String(
			Math.floor(Date.now() / 1000) - TELEGRAM_DEFAULT_MAX_AGE_SECONDS - 60,
		);
		const payload = signPayload({ id: "42", auth_date: stale });

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("expired");
	});

	it("rejects a payload just past the 60s window", () => {
		// 61s old: outside the hardened default window, must be expired.
		const stale = String(Math.floor(Date.now() / 1000) - 61);
		const payload = signPayload({ id: "42", auth_date: stale });

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("expired");
	});

	it("accepts a payload within the 60s window", () => {
		// 30s old: comfortably inside the window, must verify.
		const recent = String(Math.floor(Date.now() / 1000) - 30);
		const payload = signPayload({ id: "42", auth_date: recent });

		const result = verifyTelegramLogin(payload, BOT_TOKEN);
		expect(result.ok).toBe(true);
	});

	it("rejects a payload missing required fields", () => {
		const result = verifyTelegramLogin(
			{ id: "42", auth_date: freshAuthDate() },
			BOT_TOKEN,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("missing_fields");
	});

	it("ignores extra params not part of the Telegram field set", () => {
		// A signed payload plus an extra param we add ourselves (e.g. callbackURL)
		// must still verify — the extra param must not enter the check string.
		const payload = signPayload({
			id: "42",
			first_name: "Mark",
			auth_date: freshAuthDate(),
		});

		const result = verifyTelegramLogin(
			{ ...payload, callbackURL: "https://app.rox.one" },
			BOT_TOKEN,
		);
		expect(result.ok).toBe(true);
	});
});
