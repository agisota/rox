/** Base URL for the Telegram Bot API. */
export const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Builds a Bot API method URL. Telegram embeds the bot token in the path
 * (`/bot<token>/<method>`), so the token must never be logged with the URL.
 */
export function telegramApiUrl(botToken: string, method: string): string {
	return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
}
