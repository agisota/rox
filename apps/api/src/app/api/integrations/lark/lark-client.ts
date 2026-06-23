import { larkApiBase } from "./constants";

/**
 * Minimal Lark/Feishu Open Platform client built on `fetch`.
 *
 * Unlike Telegram (token-in-URL), Lark authenticates outbound calls with a
 * short-lived `tenant_access_token` minted from the app's `app_id` + `app_secret`
 * via `auth/v3/tenant_access_token/internal`. Every method accepts an injectable
 * `fetchImpl` (defaulting to global `fetch`) so tests assert URL/method/body with
 * no real network I/O.
 *
 * Each call returns the parsed Lark envelope and throws a clear `Error` when the
 * transport fails or Lark responds with a non-zero `code`.
 */

/** Lark API envelope: `code === 0` is success; `msg`/`code` describe failures. */
export type LarkApiResponse<TData = unknown> = {
	code: number;
	msg?: string;
	data?: TData;
	/** Present on the tenant-token endpoint (not nested under `data`). */
	tenant_access_token?: string;
	expire?: number;
};

type FetchImpl = typeof fetch;

async function callLark<TData>(
	url: string,
	payload: Record<string, unknown>,
	method: string,
	headers: Record<string, string>,
	fetchImpl: FetchImpl,
): Promise<LarkApiResponse<TData>> {
	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: {
				"content-type": "application/json; charset=utf-8",
				...headers,
			},
			body: JSON.stringify(payload),
		});
	} catch (cause) {
		throw new Error(`Lark ${method} request failed`, { cause });
	}

	let parsed: LarkApiResponse<TData>;
	try {
		parsed = (await response.json()) as LarkApiResponse<TData>;
	} catch (cause) {
		throw new Error(
			`Lark ${method} returned a non-JSON response (status ${response.status})`,
			{ cause },
		);
	}

	if (parsed.code !== 0) {
		throw new Error(
			`Lark ${method} failed: ${parsed.msg ?? `code ${parsed.code}`}`,
		);
	}

	return parsed;
}

/**
 * Mints a `tenant_access_token` for a custom (internal) app. The token is valid
 * for up to 2h; callers fetch a fresh one per job rather than caching, mirroring
 * the stateless per-message flow of the other channels.
 */
export async function getTenantAccessToken({
	appId,
	appSecret,
	region,
	fetchImpl = fetch,
}: {
	appId: string;
	appSecret: string;
	region?: string | null;
	fetchImpl?: FetchImpl;
}): Promise<string> {
	const parsed = await callLark(
		`${larkApiBase(region)}/open-apis/auth/v3/tenant_access_token/internal`,
		{ app_id: appId, app_secret: appSecret },
		"tenant_access_token",
		{},
		fetchImpl,
	);

	const token = parsed.tenant_access_token;
	if (typeof token !== "string" || token.length === 0) {
		throw new Error("Lark tenant_access_token missing from response");
	}
	return token;
}

/**
 * Replies to an inbound message in its thread via
 * `im/v1/messages/:message_id/reply`. `content` is sent as a JSON *string*
 * (`{"text":"..."}`), matching how Lark delivers inbound text. `uuid` makes the
 * reply idempotent inside Lark for 1h, so a redelivered/duplicated job cannot
 * post the same reply twice.
 */
export function replyMessage({
	tenantAccessToken,
	messageId,
	text,
	uuid,
	region,
	fetchImpl = fetch,
}: {
	tenantAccessToken: string;
	messageId: string;
	text: string;
	uuid?: string;
	region?: string | null;
	fetchImpl?: FetchImpl;
}): Promise<LarkApiResponse> {
	const payload: Record<string, unknown> = {
		msg_type: "text",
		content: JSON.stringify({ text }),
		reply_in_thread: true,
	};
	if (uuid) payload.uuid = uuid;

	return callLark(
		`${larkApiBase(region)}/open-apis/im/v1/messages/${encodeURIComponent(
			messageId,
		)}/reply`,
		payload,
		"reply",
		{ authorization: `Bearer ${tenantAccessToken}` },
		fetchImpl,
	);
}

/**
 * Sends a new text message to a chat via `im/v1/messages?receive_id_type=chat_id`.
 * Used as a fallback when no originating `message_id` is available to reply to.
 */
export function sendMessage({
	tenantAccessToken,
	chatId,
	text,
	uuid,
	region,
	fetchImpl = fetch,
}: {
	tenantAccessToken: string;
	chatId: string;
	text: string;
	uuid?: string;
	region?: string | null;
	fetchImpl?: FetchImpl;
}): Promise<LarkApiResponse> {
	const payload: Record<string, unknown> = {
		receive_id: chatId,
		msg_type: "text",
		content: JSON.stringify({ text }),
	};
	if (uuid) payload.uuid = uuid;

	return callLark(
		`${larkApiBase(region)}/open-apis/im/v1/messages?receive_id_type=chat_id`,
		payload,
		"sendMessage",
		{ authorization: `Bearer ${tenantAccessToken}` },
		fetchImpl,
	);
}
