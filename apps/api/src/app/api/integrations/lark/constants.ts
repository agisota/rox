// Lark (Larksuite, international) and Feishu (China) share the same Open Platform
// API surface but live on different hosts. Outbound callers pick the base by the
// connection's region; inbound event handling here is host-agnostic.
export const LARK_API_BASE = "https://open.larksuite.com";
export const FEISHU_API_BASE = "https://open.feishu.cn";

/** Default outbound base when a connection does not specify a region. */
export const DEFAULT_LARK_API_BASE = LARK_API_BASE;

// Event types delivered by Lark's event-subscription callbacks (schema 2.0).
export const LARK_EVENT_TYPE = {
	/** A message was received in a chat the bot is a member of. */
	MESSAGE_RECEIVE: "im.message.receive_v1",
} as const;

export type LarkEventType =
	(typeof LARK_EVENT_TYPE)[keyof typeof LARK_EVENT_TYPE];

/** Default model for Lark assistant replies (mirrors the Telegram default). */
export const DEFAULT_LARK_MODEL = "claude-sonnet-4-6";

/**
 * Outbound base URL for a connection. Lark/Feishu share the API surface but live
 * on different hosts; until the connection records a region we default to the
 * international `open.larksuite.com` host. Centralised here so a future
 * `region` field on `LarkConfig` only needs one switch.
 */
export function larkApiBase(region?: string | null): string {
	return region === "cn" || region === "feishu"
		? FEISHU_API_BASE
		: DEFAULT_LARK_API_BASE;
}
