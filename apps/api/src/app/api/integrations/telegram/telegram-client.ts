import { telegramApiUrl } from "./constants";

/**
 * Minimal Telegram Bot API client built on `fetch`.
 *
 * Telegram has no request signing; the bot token in the URL path authenticates
 * each call. Every method accepts an injectable `fetchImpl` (defaulting to the
 * global `fetch`) so tests can assert URL/method/body without real network I/O.
 *
 * Each call returns the parsed Telegram envelope and throws a clear `Error` when
 * the transport fails or Telegram responds with `{ ok: false }`.
 */

/** Telegram API envelope. `result` is present on success, `description` on error. */
export type TelegramApiResponse<TResult = unknown> = {
	ok: boolean;
	result?: TResult;
	description?: string;
	error_code?: number;
};

type FetchImpl = typeof fetch;

async function callTelegram<TResult>(
	botToken: string,
	method: string,
	payload: Record<string, unknown>,
	fetchImpl: FetchImpl,
): Promise<TelegramApiResponse<TResult>> {
	let response: Response;
	try {
		response = await fetchImpl(telegramApiUrl(botToken, method), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
	} catch (cause) {
		throw new Error(`Telegram ${method} request failed`, { cause });
	}

	let parsed: TelegramApiResponse<TResult>;
	try {
		parsed = (await response.json()) as TelegramApiResponse<TResult>;
	} catch (cause) {
		throw new Error(
			`Telegram ${method} returned a non-JSON response (status ${response.status})`,
			{ cause },
		);
	}

	if (!parsed.ok) {
		throw new Error(
			`Telegram ${method} failed: ${parsed.description ?? `status ${response.status}`}`,
		);
	}

	return parsed;
}

/** Sends a text message to a chat via `sendMessage`. */
export function sendMessage({
	botToken,
	chatId,
	text,
	fetchImpl = fetch,
}: {
	botToken: string;
	chatId: number | string;
	text: string;
	fetchImpl?: FetchImpl;
}): Promise<TelegramApiResponse> {
	return callTelegram(
		botToken,
		"sendMessage",
		{ chat_id: chatId, text },
		fetchImpl,
	);
}

/**
 * Registers the inbound webhook via `setWebhook`. `secretToken` is echoed back by
 * Telegram on every update through the `X-Telegram-Bot-Api-Secret-Token` header,
 * which the webhook uses to resolve the originating connection.
 */
export function setWebhook({
	botToken,
	url,
	secretToken,
	fetchImpl = fetch,
}: {
	botToken: string;
	url: string;
	secretToken: string;
	fetchImpl?: FetchImpl;
}): Promise<TelegramApiResponse> {
	return callTelegram(
		botToken,
		"setWebhook",
		{ url, secret_token: secretToken },
		fetchImpl,
	);
}

/** Removes the registered webhook via `deleteWebhook`. */
export function deleteWebhook({
	botToken,
	fetchImpl = fetch,
}: {
	botToken: string;
	fetchImpl?: FetchImpl;
}): Promise<TelegramApiResponse> {
	return callTelegram(botToken, "deleteWebhook", {}, fetchImpl);
}
