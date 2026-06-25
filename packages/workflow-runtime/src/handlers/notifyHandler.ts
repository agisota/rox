import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * Delivery request handed to the injected notify port for a `notify` block. Kept
 * transport-agnostic so `@rox/workflow-runtime` stays integration/SDK-free: the
 * run-service wires the real port (which fans out to the existing Telegram /
 * Discord / Slack / email integrations in `@rox/trpc`), unit tests inject a fake.
 * The handler has already resolved `{{path}}` placeholders in the message before
 * the request reaches the port — the port performs the bare delivery.
 */
export interface NotifyRequest {
	/** Delivery channel id from the node config (`email`/`slack`/`webhook`/`in_app`,
	 * or an integration provider slug). The port maps it to a concrete sender. */
	channel: string;
	/** Rendered message body (placeholders already expanded). */
	message: string;
	/** Optional channel-specific target (chat id, address, webhook url, …) resolved
	 * from `subBlocks.target`; the port decides how to interpret it. */
	target?: string;
}

export interface NotifyResult {
	/** Whether the channel accepted the message. */
	delivered: boolean;
	/** Provider-side message/id reference, when the channel returns one. */
	ref?: string;
}

/**
 * Impure notify port: performs the bare delivery via the existing notification
 * integrations. Injected by the run-service so the executor stays
 * integration-free. Implementations may throw on a transport failure (the
 * handler maps that to the `error` handle).
 */
export type NotifyPort = (req: NotifyRequest) => Promise<NotifyResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Build the `notify` block handler — an output node that sends a message to a
 * delivery channel. Reads the node config from `block.subBlocks` (channel,
 * message, optional target), expands `{{path}}` placeholders in the message from
 * the merged upstream input, then delegates the bare delivery to
 * {@link NotifyPort}. Chainable: on success the input is passed through under the
 * `out` handle (so downstream nodes still run) with the delivery ref attached; a
 * missing channel/message or a delivery failure routes to the `error` handle.
 */
export function makeNotifyHandler(notify: NotifyPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const channel = asString(sub.channel);
		if (channel == null || channel.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "NOTIFY_CHANNEL_MISSING",
					message: "Notify node has no channel configured (subBlocks.channel).",
					blockId: ctx.blockId,
				},
			};
		}

		const messageRaw = asString(sub.message);
		if (messageRaw == null || messageRaw.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "NOTIFY_MESSAGE_MISSING",
					message: "Notify node has no message configured (subBlocks.message).",
					blockId: ctx.blockId,
				},
			};
		}

		const message = resolvePromptTemplate(messageRaw, ctx.input);
		const target = asString(sub.target);

		let res: NotifyResult;
		try {
			res = await notify({
				channel,
				message,
				...(target != null && target !== "" ? { target } : {}),
			});
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "NOTIFY_DELIVERY_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}

		if (!res.delivered) {
			return {
				handle: "error",
				error: {
					code: "NOTIFY_NOT_DELIVERED",
					message: `Notify channel "${channel}" did not accept the message.`,
					blockId: ctx.blockId,
				},
			};
		}

		// Chainable: pass the input through so downstream nodes still run, with the
		// delivery provenance attached under `notify`.
		return {
			handle: "out",
			output: {
				...ctx.input,
				notify: {
					channel,
					delivered: true,
					...(res.ref != null ? { ref: res.ref } : {}),
				},
			},
		};
	};
}
