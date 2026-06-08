import { timingSafeEqual } from "node:crypto";

/**
 * Verifies the X-Telegram-Bot-Api-Secret-Token header sent by Telegram
 * on every webhook delivery when a secret token was provided to setWebhook.
 */
export function verifyTelegramSignature({
	secretToken,
	headerValue,
}: {
	secretToken: string;
	headerValue: string;
}): boolean {
	try {
		const a = Buffer.from(secretToken, "utf8");
		const b = Buffer.from(headerValue, "utf8");
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
