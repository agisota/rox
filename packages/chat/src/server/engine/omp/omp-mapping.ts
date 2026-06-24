/**
 * Pure mappers from omp (`oh-my-pi`) RPC frames to Rox's mastra-shaped
 * {@link HarnessMessage} / {@link HarnessDisplayState} / Harness event types.
 *
 * Verified against a live `omp/15.11.0 --mode rpc` spike. The omp `AgentMessage`
 * is structurally close to {@link HarnessMessage} already (`role`, `content[]`
 * with `text`/`thinking`/`tool_call`/`tool_result`), so these mappers mostly
 * normalize field names and surface the error fields omp carries on the message
 * (`stopReason:"error"` + `errorMessage`/`errorStatus`).
 */

import {
	defaultDisplayState,
	type HarnessDisplayState,
	type HarnessMessage,
	type HarnessMessageContent,
} from "@mastra/core/harness";

/** An omp `AgentMessage` content part (subset Rox cares about). */
interface OmpContentPart {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	args?: unknown;
	input?: unknown;
	result?: unknown;
	content?: unknown;
	isError?: boolean;
}

/** An omp `AgentMessage` as seen on `message_*` events and `get_messages`. */
export interface OmpAgentMessage {
	role: "user" | "assistant" | "system";
	content: OmpContentPart[];
	timestamp?: number;
	stopReason?: string;
	errorMessage?: string;
	errorStatus?: number;
	[key: string]: unknown;
}

/** Shape of `get_state` `data` (the fields Rox reads). */
export interface OmpStateData {
	isStreaming?: boolean;
	isCompacting?: boolean;
	messageCount?: number;
	sessionId?: string;
	model?: { id?: string; name?: string };
	[key: string]: unknown;
}

let monotonicCounter = 0;

/**
 * Deterministic-ish id for messages omp does not assign an `id` to. omp keys
 * messages by `timestamp`; we fold in a counter so two parts sharing a
 * millisecond stay distinct and stable within a snapshot pass.
 */
function deriveMessageId(message: OmpAgentMessage, index: number): string {
	if (typeof message.id === "string" && message.id) return message.id;
	const ts = typeof message.timestamp === "number" ? message.timestamp : 0;
	return `omp-${ts}-${index}`;
}

/** Map omp's `stopReason` strings to the {@link HarnessMessage} union. */
function mapStopReason(
	stopReason: string | undefined,
): HarnessMessage["stopReason"] {
	switch (stopReason) {
		case "stop":
		case "complete":
		case "end_turn":
			return "complete";
		case "tool_use":
		case "tool_calls":
			return "tool_use";
		case "aborted":
		case "abort":
			return "aborted";
		case "error":
			return "error";
		default:
			return undefined;
	}
}

/** Map a single omp content part to a {@link HarnessMessageContent}. */
function mapContentPart(part: OmpContentPart): HarnessMessageContent | null {
	switch (part.type) {
		case "text":
			return { type: "text", text: part.text ?? "" };
		case "thinking":
		case "reasoning":
			return { type: "thinking", thinking: part.thinking ?? part.text ?? "" };
		case "tool_call":
		case "toolcall":
		case "tool_use":
			return {
				type: "tool_call",
				id: part.id ?? "",
				name: part.name ?? "",
				args: part.args ?? part.input ?? {},
			};
		case "tool_result":
		case "tool_response":
			return {
				type: "tool_result",
				id: part.id ?? "",
				name: part.name ?? "",
				result: part.result ?? part.content ?? null,
				isError: Boolean(part.isError),
			};
		default:
			return null;
	}
}

/** Map an omp `AgentMessage` to a {@link HarnessMessage}. */
export function mapAgentMessage(
	message: OmpAgentMessage,
	index = monotonicCounter++,
): HarnessMessage {
	const content = (message.content ?? [])
		.map(mapContentPart)
		.filter((part): part is HarnessMessageContent => part !== null);

	const harnessMessage: HarnessMessage = {
		id: deriveMessageId(message, index),
		role: message.role,
		content,
		createdAt:
			typeof message.timestamp === "number"
				? new Date(message.timestamp)
				: new Date(),
		stopReason: mapStopReason(message.stopReason),
	};

	if (message.errorMessage) {
		harnessMessage.errorMessage = message.errorMessage;
		// omp reports errors via stopReason:"error" on the message; preserve it.
		harnessMessage.stopReason = "error";
	}

	return harnessMessage;
}

/** Map an array of omp messages (from `get_messages`) to {@link HarnessMessage}[]. */
export function mapAgentMessages(
	messages: OmpAgentMessage[],
): HarnessMessage[] {
	return messages.map((message, index) => mapAgentMessage(message, index));
}

/**
 * Build a {@link HarnessDisplayState} from omp `get_state` data plus the
 * last-seen streaming assistant message. omp's pull `get_state` mirrors Rox's
 * polling: `isStreaming` → `isRunning`. `currentMessage` is supplied by the
 * engine from the most recent `message_update`/`message_end` it observed (omp's
 * `get_state` does not echo the in-flight message body).
 */
export function buildDisplayState(args: {
	state: OmpStateData;
	currentMessage: HarnessMessage | null;
	pendingApproval: HarnessDisplayState["pendingApproval"];
	pendingQuestion: HarnessDisplayState["pendingQuestion"];
}): HarnessDisplayState {
	// Start from the canonical zero state so the (large) token/OM/map fields are
	// shaped correctly, then overlay the fields omp actually drives.
	const base = defaultDisplayState();
	return {
		...base,
		isRunning: Boolean(args.state.isStreaming),
		currentMessage: args.currentMessage,
		pendingApproval: args.pendingApproval,
		pendingQuestion: args.pendingQuestion,
		bufferingMessages: Boolean(args.state.isCompacting),
	};
}
