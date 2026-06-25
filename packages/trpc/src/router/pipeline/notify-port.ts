import type {
	NotifyPort,
	NotifyRequest,
	NotifyResult,
} from "@rox/workflow-runtime/handlers";

/**
 * Real notify port for the `notify` block. Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays integration/SDK-free — the
 * runtime only sees the injected {@link NotifyPort} contract.
 *
 * CHANNEL ABSTRACTION (not one hardcoded API): the concrete sender is chosen
 * here behind the port contract, mirroring `web-search-port`'s provider switch.
 * The current slice ships a Telegram sender (real Bot API `sendMessage`, the same
 * surface the Telegram integration manages); adding another channel means adding
 * a branch in {@link resolveSender} — the handler/port contract
 * (`{ delivered, ref? }`) is unchanged.
 *
 * KEYS: resolved server-side from the server environment (pipelines run on the
 * server; credentials are not threaded from the desktop host). When the selected
 * channel has no server-side sender configured the port throws a typed error,
 * which the handler surfaces as the node's `error` handle ("channel not
 * configured") rather than a silent no-op.
 *
 * FOLLOW-UP (#547 scope note): Slack / Discord / email senders need the per-org
 * integration-connection credential lookup (the `integration_connections`
 * registry) plus an org-scoped send seam that does not yet exist as a service.
 * They are left as typed not-configured branches here so the contract is real and
 * the remaining channels are an additive change, not a rewrite.
 */

/** Thrown when the selected channel has no server-side sender configured. */
export class NotifyChannelNotConfiguredError extends Error {
	constructor(channel: string) {
		super(`Notify channel "${channel}" is not configured on the server.`);
		this.name = "NotifyChannelNotConfiguredError";
	}
}

/** A channel sender: delivers one message, returns a provider ref on success. */
type ChannelSender = (req: NotifyRequest) => Promise<NotifyResult>;

/**
 * Telegram sender via the Bot API. The bot token is resolved from
 * `TELEGRAM_BOT_TOKEN`; the destination chat id comes from the node's `target`
 * (a `notify` node bound to a Telegram chat sets `subBlocks.target`). Uses native
 * `fetch` (no SDK) so this module stays dependency-light.
 */
function telegramSender(botToken: string): ChannelSender {
	return async (req) => {
		if (req.target == null || req.target === "") {
			throw new Error(
				"Telegram notify requires a target chat id (subBlocks.target).",
			);
		}
		const res = await fetch(
			`https://api.telegram.org/bot${botToken}/sendMessage`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ chat_id: req.target, text: req.message }),
			},
		);
		if (!res.ok) {
			throw new Error(`Telegram sendMessage failed with status ${res.status}`);
		}
		const body = (await res.json()) as {
			ok?: boolean;
			result?: { message_id?: number };
		};
		if (body.ok !== true) {
			return { delivered: false };
		}
		return {
			delivered: true,
			...(body.result?.message_id != null
				? { ref: String(body.result.message_id) }
				: {}),
		};
	};
}

/**
 * Resolve the channel id to a concrete sender using server-side credentials.
 * Returns null when the channel has no configured sender, so the port can throw
 * a typed not-configured error.
 */
function resolveSender(channel: string): ChannelSender | null {
	switch (channel) {
		case "telegram": {
			const token = process.env.TELEGRAM_BOT_TOKEN;
			return token ? telegramSender(token) : null;
		}
		// Slack / Discord / email / webhook / in_app: see the FOLLOW-UP note above.
		default:
			return null;
	}
}

/** The injected notify port: resolve a sender for the channel and deliver. */
export const pipelineNotify: NotifyPort = async (req) => {
	const sender = resolveSender(req.channel);
	if (sender == null) {
		throw new NotifyChannelNotConfiguredError(req.channel);
	}
	return sender(req);
};
