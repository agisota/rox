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

// ── Host-tool bridge mappers (Rox tools ↔ omp `set_host_tools` / `host_tool_*`) ──
//
// Verified against the live `omp/15.11.0 --mode rpc` host-tool sub-protocol
// (embedded `rpc.md` + the runtime `normalizeHostToolDefinitions` / RpcClient
// reference):
//
//   host→omp registration: `set_host_tools{tools: RpcHostToolDefinition[]}`,
//     each `{name, label?, description, parameters: JSONSchema, hidden?}`.
//     omp REJECTS a tool with an empty `name` or empty `description`, or a
//     `parameters` that is not a plain JSON-Schema object — so the whole
//     `set_host_tools` fails. These mappers guarantee those invariants.
//   omp→host call: `host_tool_call{id, toolCallId, toolName, arguments}`.
//   host→omp reply: success `host_tool_result{id, result:{content:[{type,text}]}}`;
//     error same shape + top-level `isError:true`. omp also accepts a bare
//     string `result` (auto-wrapped), but we always emit the explicit
//     content-array form for predictability.

/** An omp `RpcHostToolDefinition` (the `set_host_tools` tool entry shape). */
export interface OmpHostToolDefinition {
	name: string;
	label?: string;
	description: string;
	parameters: Record<string, unknown>;
	hidden?: boolean;
}

/** The `result` body of a `host_tool_result` frame (omp tool-result content). */
export interface OmpHostToolResult {
	content: Array<{ type: "text"; text: string }>;
	details?: Record<string, unknown>;
}

/**
 * A Rox host tool as surfaced by mastracode's MCP client (`listTools()`), kept
 * structural so the mapper does not depend on the mastra `Tool` class. Carries a
 * `description`, an `inputSchema` (a Standard-Schema instance exposing a JSON
 * Schema via `~standard`, or a raw JSON Schema object), and an `execute`.
 */
export interface RoxHostTool {
	id?: string;
	description?: string;
	inputSchema?: unknown;
	parameters?: unknown;
	execute?: (input: unknown, context?: unknown) => Promise<unknown> | unknown;
	[key: string]: unknown;
}

/** A minimal, valid JSON Schema object accepting any args (omp requires an object). */
const EMPTY_OBJECT_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {},
	additionalProperties: true,
};

/** True for a non-array plain object — the shape omp's `parameters` must be. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce a Rox tool's `inputSchema`/`parameters` into a JSON-Schema object for
 * omp's `parameters`. Handles three shapes, in order:
 *   1. a Standard-Schema instance (Zod et al.) exposing `~standard.jsonSchema` —
 *      the form mastra `createTool`/MCP tools use; converted via the standard
 *      `input({target:"draft-07"})` converter.
 *   2. an already-plain JSON-Schema object — returned as-is.
 *   3. anything else / conversion failure → a permissive empty-object schema, so
 *      a single odd tool never fails the whole `set_host_tools` registration.
 */
export function toHostToolParameters(schema: unknown): Record<string, unknown> {
	if (schema == null) return { ...EMPTY_OBJECT_SCHEMA };

	// (1) Standard-Schema instance: read the JSON Schema off `~standard`. When a
	// `~standard` marker is present this is a schema instance (Zod et al.), NOT a
	// raw JSON Schema, so it must be converted — and if conversion is unavailable
	// or throws, fall back to the permissive default rather than leaking the
	// wrapper object as the tool's parameters.
	const standard = (schema as { "~standard"?: unknown })["~standard"];
	if (isPlainObject(standard)) {
		const converter = (standard as { jsonSchema?: unknown }).jsonSchema;
		const toInput =
			isPlainObject(converter) &&
			typeof (converter as { input?: unknown }).input === "function"
				? (converter as { input: (o: { target: string }) => unknown }).input
				: null;
		if (toInput) {
			try {
				const json = toInput({ target: "draft-07" });
				if (isPlainObject(json)) return json;
			} catch {
				// fall through to the permissive default
			}
		}
		return { ...EMPTY_OBJECT_SCHEMA };
	}

	// (2) Already a raw JSON-Schema object (type:"object", or any object schema).
	if (isPlainObject(schema)) return schema;

	// (3) Unconvertible — accept-any so registration still succeeds.
	return { ...EMPTY_OBJECT_SCHEMA };
}

/**
 * Translate one Rox host tool into an omp {@link OmpHostToolDefinition}. The
 * `name` is supplied by the caller (the `listTools()` record key, omp's tool
 * id). Guarantees omp's invariants: non-empty `name`/`description` and an object
 * `parameters` (a missing description is back-filled so the tool still
 * registers rather than failing the whole batch).
 */
export function mapToolToHostDefinition(
	name: string,
	tool: RoxHostTool,
): OmpHostToolDefinition {
	const trimmedName = name.trim();
	const rawDescription =
		typeof tool.description === "string" ? tool.description.trim() : "";
	const description = rawDescription || `Host-provided tool "${trimmedName}".`;
	return {
		name: trimmedName,
		label: trimmedName,
		description,
		parameters: toHostToolParameters(tool.inputSchema ?? tool.parameters),
	};
}

/**
 * Build the `set_host_tools` `tools` array from a Rox host-tool record. Skips
 * entries without an `execute` (nothing for the host to run) and entries whose
 * name is empty after trimming, so the registration omp receives is always
 * valid and every registered tool is actually invocable.
 */
export function buildHostToolDefinitions(
	tools: Record<string, RoxHostTool>,
): OmpHostToolDefinition[] {
	const definitions: OmpHostToolDefinition[] = [];
	for (const [name, tool] of Object.entries(tools)) {
		if (!name.trim()) continue;
		if (typeof tool?.execute !== "function") continue;
		definitions.push(mapToolToHostDefinition(name, tool));
	}
	return definitions;
}

/** Flatten an arbitrary Rox tool-execute result into omp's text content array. */
function resultToContent(
	result: unknown,
): Array<{ type: "text"; text: string }> {
	if (typeof result === "string") {
		return [{ type: "text", text: result }];
	}
	// Mastra MCP tools commonly return `{ content: [{ type:"text", text }] }`
	// already; pass through any text parts verbatim.
	if (isPlainObject(result) && Array.isArray(result.content)) {
		const parts = (result.content as unknown[])
			.map((part) => {
				if (isPlainObject(part) && typeof part.text === "string") {
					return { type: "text" as const, text: part.text };
				}
				return null;
			})
			.filter((part): part is { type: "text"; text: string } => part !== null);
		if (parts.length > 0) return parts;
	}
	// Fallback: serialize the whole result so the model still sees the output.
	return [
		{
			type: "text",
			text:
				result === undefined
					? ""
					: typeof result === "object"
						? JSON.stringify(result)
						: String(result),
		},
	];
}

/**
 * Map a successful Rox tool-execute result to a `host_tool_result.result` body.
 * Pure: the engine wraps this in `{type:"host_tool_result", id, result}`.
 */
export function mapHostToolResult(result: unknown): OmpHostToolResult {
	return { content: resultToContent(result) };
}

/**
 * Build the `host_tool_result.result` body for a failed Rox tool execution.
 * The engine sets top-level `isError:true` alongside this; omp surfaces the
 * text content to the model as a tool error (verified live).
 */
export function buildHostToolErrorResult(error: unknown): OmpHostToolResult {
	const message =
		error instanceof Error
			? error.message
			: String(error ?? "host tool failed");
	return { content: [{ type: "text", text: message }], details: {} };
}

// ── Prompt attachments (Rox `files` ↔ omp `prompt.images`) ──────────────────
//
// Verified against `omp/15.11.0 --mode rpc`: the `prompt`/`steer`/`follow_up`
// commands accept `images: ImageContent[]`, where each element is
// `{ data: <base64>, mimeType: <string> }` (omp's `zImageContent`; a `uri?` is
// also allowed but unused here). omp spreads these into the user message as
// `{type:"image"}` content parts and forwards them to the provider — a valid
// PNG round-trips and the model sees it (live: an 8×8 blue PNG → "Blue.").
//
// omp's `prompt` has NO arbitrary-file channel — only images. Non-image Rox
// attachments (PDFs, text files, …) cannot be forwarded as native attachments,
// so they are surfaced to the model as a text note instead of being silently
// dropped (the caller inlines {@link summarizeUnsupportedAttachments}).

/** A Rox attachment as carried on `sendMessage({files})`. */
export interface RoxFileAttachment {
	/** Base64-encoded file bytes (no `data:` URI prefix). */
	data: string;
	/** The IANA media type, e.g. `image/png`. */
	mediaType: string;
	/** Optional original file name. */
	filename?: string;
}

/** An omp `ImageContent` element for the `prompt.images` field. */
export interface OmpPromptImage {
	data: string;
	mimeType: string;
}

/** True for a media type omp can forward as a native image attachment. */
function isImageMediaType(mediaType: string | undefined): boolean {
	return typeof mediaType === "string" && mediaType.startsWith("image/");
}

/**
 * Partition Rox `files` into the omp-native image attachments omp's `prompt`
 * accepts (`{data, mimeType}`) and the rest it cannot carry. Pure: the engine
 * sends `images` on the `prompt` frame and inlines a note for `unsupported`.
 */
export function partitionPromptAttachments(files: RoxFileAttachment[]): {
	images: OmpPromptImage[];
	unsupported: RoxFileAttachment[];
} {
	const images: OmpPromptImage[] = [];
	const unsupported: RoxFileAttachment[] = [];
	for (const file of files) {
		if (
			file &&
			typeof file.data === "string" &&
			isImageMediaType(file.mediaType)
		) {
			images.push({ data: file.data, mimeType: file.mediaType });
		} else if (file) {
			unsupported.push(file);
		}
	}
	return { images, unsupported };
}

/**
 * Build a short text note describing attachments omp's `prompt` cannot carry
 * natively (anything that is not an image), so the model is at least aware of
 * them. Returns `""` when there are none. Pure.
 */
export function summarizeUnsupportedAttachments(
	unsupported: RoxFileAttachment[],
): string {
	if (unsupported.length === 0) return "";
	const names = unsupported
		.map(
			(file, index) =>
				file.filename?.trim() || `${file.mediaType || "file"} #${index + 1}`,
		)
		.join(", ");
	return `[${unsupported.length} non-image attachment(s) not forwarded to omp (omp rpc prompt accepts images only): ${names}]`;
}

// ── System-reminder injection (no omp inject-message frame) ─────────────────
//
// omp's RPC command set (verified: the full `handleCommand` dispatcher) has no
// "append/inject message" command — a system reminder cannot be persisted as
// its own omp turn over rpc. Instead the engine buffers pending reminders and
// prepends them to the next `prompt.message` as a `<system-reminder>` block,
// which is how Rox surfaces memory-context to the model anyway.

/**
 * Compose the next prompt message body from any buffered system reminders and
 * the user's content. Reminders are emitted as `<system-reminder>` blocks above
 * the user text (matching Rox's reminder convention). Returns `content`
 * unchanged when there are no reminders. Pure.
 */
export function composeMessageWithReminders(
	content: string,
	reminders: string[],
): string {
	const blocks = reminders
		.map((reminder) => reminder.trim())
		.filter((reminder) => reminder.length > 0)
		.map((reminder) => `<system-reminder>\n${reminder}\n</system-reminder>`);
	if (blocks.length === 0) return content;
	return `${blocks.join("\n")}\n\n${content}`;
}
