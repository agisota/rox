import type { HostServiceContext } from "../../../types";
import { type AgentRunInput, runAgentInWorkspace } from "./agents";

/**
 * Host-side (desktop) half of the `agent_run` host bridge.
 *
 * The main-API resolver (`packages/trpc/.../agent-run-host-bridge.ts`) relays
 * `agents.runAndCapture` here. Unlike fire-and-forget `agents.run`, a pipeline
 * node needs the agent's OUTPUT back inline so the executor can thread it into
 * the accumulating context. This module:
 *
 *   1. starts the agent via the shared {@link runAgentInWorkspace} (chat or CLI),
 *   2. waits for the run to settle, and
 *   3. captures the resulting text (chat assistant tail / terminal buffer tail).
 *
 * The text extraction ({@link extractAssistantText}, {@link captureChatOutput})
 * is pure and unit tested. The live completion wait is the genuine cross-process
 * boundary — it depends on the running mastracode harness / pty — and is
 * implemented behind a typed seam with `TODO(agent-pipelines)` where the live
 * wiring lands.
 */

export interface AgentRunCaptureInput extends AgentRunInput {
	/** Max agent turns before the host forces a stop (advisory; honored once the
	 * harness exposes a turn cap). */
	maxTurns: number;
}

export interface AgentRunCaptureResult {
	kind: "chat" | "terminal";
	sessionId: string;
	/** Captured agent output text (assistant transcript tail / terminal tail). */
	message: string;
	/** Artifacts the agent reported, when discoverable. */
	artifacts?: { kind: string; ref: string }[];
}

/** A minimal structural view of a chat message (defensive — mastracode owns the
 * concrete type; we read only what we need). */
interface MessageLike {
	role?: unknown;
	content?: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Extract the plain text of a single chat message's `content`. Mirrors the
 * `extractTextContent` helper in `@rox/chat` runtime: content is an array of
 * parts; we keep `{ type: "text", text }` parts and join them. Anything else
 * (tool calls, images) is ignored. Pure + defensive.
 */
export function extractMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (
			isObjectRecord(part) &&
			part.type === "text" &&
			typeof part.text === "string"
		) {
			parts.push(part.text);
		}
	}
	return parts.join("");
}

/**
 * Reduce a chat transcript to the latest assistant turn's text. Walks from the
 * end to the first assistant message and returns its extracted text. Pure: the
 * caller supplies the already-fetched message list. Returns "" when there is no
 * assistant message yet (the caller treats that as "not done").
 */
export function extractAssistantText(messages: readonly unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as MessageLike;
		if (message?.role === "assistant") {
			return extractMessageText(message.content).trim();
		}
	}
	return "";
}

/** Tunables for the chat-completion poll (overridable in tests). */
export interface ChatCaptureOptions {
	/** Total time to wait for the assistant turn to settle. */
	deadlineMs?: number;
	/** Delay between snapshot polls. */
	pollIntervalMs?: number;
	/** Injectable clock/sleep for deterministic tests. */
	sleep?: (ms: number) => Promise<void>;
	/** Injectable "now" for deterministic tests. */
	now?: () => number;
}

const DEFAULT_CHAT_DEADLINE_MS = 150_000;
const DEFAULT_CHAT_POLL_INTERVAL_MS = 750;

/**
 * Poll a chat session until its assistant turn settles, then return the
 * assistant text. `fetchSnapshot` returns the harness display state + messages;
 * `isSettled` decides when the turn is done (no longer running, no pending
 * question). Pure with respect to its injected ports — the live wiring passes
 * the host chat runtime's `getSnapshot`.
 */
export async function captureChatOutput(
	fetchSnapshot: () => Promise<{
		settled: boolean;
		messages: readonly unknown[];
	}>,
	options: ChatCaptureOptions = {},
): Promise<string> {
	const deadlineMs = options.deadlineMs ?? DEFAULT_CHAT_DEADLINE_MS;
	const pollIntervalMs =
		options.pollIntervalMs ?? DEFAULT_CHAT_POLL_INTERVAL_MS;
	const now = options.now ?? Date.now;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

	const start = now();
	let lastText = "";
	// Poll until the harness reports the turn settled or we hit the deadline.
	while (now() - start < deadlineMs) {
		const snapshot = await fetchSnapshot();
		const text = extractAssistantText(snapshot.messages);
		if (text) lastText = text;
		if (snapshot.settled && text) return text;
		await sleep(pollIntervalMs);
	}
	// Deadline hit: return whatever assistant text we managed to capture (may be
	// empty — the caller maps an empty capture to AGENT_NO_OUTPUT).
	return lastText;
}

/**
 * Start an agent in the workspace, wait for completion, and capture its output.
 *
 * Chat agents run in the host chat runtime (fire-and-forget `sendMessage`), so
 * we poll the session snapshot for the settled assistant turn. Terminal agents
 * spawn a CLI in a pty; capturing their output requires reading the terminal
 * buffer tail once the process exits.
 */
export async function runAgentAndCapture(
	ctx: HostServiceContext,
	input: AgentRunCaptureInput,
): Promise<AgentRunCaptureResult> {
	const started = await runAgentInWorkspace(ctx, input);

	if (started.kind === "chat") {
		const message = await captureChatOutput(async () => {
			// The host chat runtime exposes a combined snapshot (displayState +
			// messages). A turn is settled when the harness is not actively running
			// and has no pending question/permission gate.
			const snapshot = await ctx.runtime.chat.getSnapshot({
				sessionId: started.sessionId,
				workspaceId: input.workspaceId,
			});
			const displayState = snapshot.displayState as {
				isRunning?: unknown;
				pendingQuestion?: unknown;
			};
			const settled =
				displayState.isRunning !== true && displayState.pendingQuestion == null;
			return {
				settled,
				messages: snapshot.messages as readonly unknown[],
			};
		});
		return { kind: "chat", sessionId: started.sessionId, message };
	}

	// Terminal CLI agent: the process runs in a pty. Capturing its output is the
	// genuine cross-process boundary — it needs the terminal buffer tail read back
	// after the process exits (the `terminal:lifecycle` exit signal).
	// TODO(agent-pipelines): block on the terminal `exit` event for
	// `started.sessionId`, then read the pty scrollback tail (last assistant
	// turn) via the terminal manager and return it as `message`. Until that
	// read-back lands, surface a deterministic marker so the run still completes
	// with a typed, non-empty transcript entry and a real childRunRef.
	return {
		kind: "terminal",
		sessionId: started.sessionId,
		message: `[terminal agent ${input.agent}] dispatched; output capture pending host buffer read-back`,
	};
}
