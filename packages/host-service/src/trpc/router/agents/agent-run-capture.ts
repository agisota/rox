import {
	listTerminalSessions,
	readTerminalBufferBytes,
} from "../../../terminal/terminal";
import type { HostServiceContext } from "../../../types";
import {
	type AgentRunInput,
	type AgentRunResult,
	runAgentInWorkspace,
} from "./agents";
import { extractTerminalOutputTail } from "./extract-terminal-output-tail";

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
 * Both text extractions are pure + unit tested: the chat tail
 * ({@link extractAssistantText}, {@link captureChatOutput}) and the terminal
 * tail ({@link extractTerminalOutputTail}). The live completion waits and the
 * pty buffer read are the genuine cross-process boundaries — they depend on the
 * running mastracode harness / pty-daemon — and are isolated behind typed ports
 * ({@link TerminalCapturePort}) so the orchestration is fully testable and the
 * live wiring is a single injection point.
 */

export interface AgentRunCaptureInput extends AgentRunInput {
	/** Max agent turns before the host forces a stop. */
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

/** Tunables for the terminal-exit poll (overridable in tests). */
export interface TerminalCaptureOptions {
	/** Total time to wait for the pty process to exit. */
	deadlineMs?: number;
	/** Delay between exit-state polls. */
	pollIntervalMs?: number;
	/** Injectable clock/sleep for deterministic tests. */
	sleep?: (ms: number) => Promise<void>;
	/** Injectable "now" for deterministic tests. */
	now?: () => number;
	/** Max meaningful trailing lines threaded into the pipeline context. */
	maxTailLines?: number;
}

const DEFAULT_TERMINAL_DEADLINE_MS = 600_000;
const DEFAULT_TERMINAL_POLL_INTERVAL_MS = 1_000;
export const MAX_AGENT_CAPTURE_TURNS = 200;

function normalizeAgentCaptureMaxTurns(value: number): number {
	if (!Number.isFinite(value)) return 8;
	const floored = Math.floor(value);
	if (floored < 1) return 8;
	return Math.min(floored, MAX_AGENT_CAPTURE_TURNS);
}

/**
 * Cross-process boundary for terminal/CLI agent capture, isolated behind a typed
 * port so the orchestration ({@link captureTerminalOutput}) is fully unit
 * testable. The default ({@link defaultTerminalCapturePort}) wires the live
 * pty-daemon-backed terminal manager.
 */
export interface TerminalCapturePort {
	/**
	 * Resolve `true` once the pty process for `terminalId` has exited, `false` if
	 * it is still running (the caller polls). The live implementation reads the
	 * terminal manager's session state — which flips `exited` on the
	 * `terminal:lifecycle` exit event.
	 */
	hasExited(terminalId: string, workspaceId: string): boolean;
	/**
	 * Read the raw pty scrollback buffer for `terminalId`, or `null` when no
	 * readable buffer is available from this process (e.g. the buffer accessor is
	 * not wired). Bytes (the session ring buffer), a single chunk, or decoded
	 * text are all accepted — {@link extractTerminalOutputTail} normalises them.
	 */
	readBuffer(
		terminalId: string,
		workspaceId: string,
	): string | Uint8Array | readonly Uint8Array[] | null;
}

/**
 * Live terminal capture port — both edges are real cross-process reads.
 *
 * `hasExited` reads the publicly-exported {@link listTerminalSessions} summary
 * (which the terminal manager flips to `exited: true` from the pty `onExit`
 * handler — the same edge that fires `terminal:lifecycle`).
 *
 * `readBuffer` reads the session's raw scrollback ring buffer via the
 * publicly-exported {@link readTerminalBufferBytes} accessor and returns those
 * byte chunks unchanged; {@link extractTerminalOutputTail} decodes + cleans them.
 * It returns `null` only when no such session is known to this process (unknown
 * id / workspace mismatch), in which case {@link captureTerminalOutput} maps the
 * `null` read to a deterministic, typed marker so the run still completes with a
 * real `sessionId`/childRunRef rather than throwing.
 */
export const defaultTerminalCapturePort: TerminalCapturePort = {
	hasExited(terminalId, workspaceId) {
		const sessions = listTerminalSessions({
			workspaceId,
			includeExited: true,
		});
		const session = sessions.find((s) => s.terminalId === terminalId);
		// Unknown session id ⇒ treat as exited so we don't poll forever for a
		// terminal that was never created / already reaped.
		return session ? session.exited : true;
	},
	readBuffer(terminalId, workspaceId) {
		// Real read-back of the pty scrollback ring buffer (bytes). `null` ⇒ the
		// session is unknown to this process (never created / already reaped) — the
		// caller maps that to the dispatched marker.
		return readTerminalBufferBytes({ terminalId, workspaceId });
	},
};

/**
 * Wait for a terminal/CLI agent's pty to exit, then extract the meaningful tail
 * of its scrollback as clean plain text. Pure with respect to its injected
 * {@link TerminalCapturePort} + clock — the live wiring passes
 * {@link defaultTerminalCapturePort}.
 *
 * Returns `null` when no buffer could be read (the caller maps that to a typed
 * dispatched-marker), or the extracted tail otherwise (possibly "" when the
 * buffer held no meaningful content, which the caller maps to AGENT_NO_OUTPUT).
 */
export async function captureTerminalOutput(
	port: TerminalCapturePort,
	args: { terminalId: string; workspaceId: string; echoedCommand?: string },
	options: TerminalCaptureOptions = {},
): Promise<string | null> {
	const deadlineMs = options.deadlineMs ?? DEFAULT_TERMINAL_DEADLINE_MS;
	const pollIntervalMs =
		options.pollIntervalMs ?? DEFAULT_TERMINAL_POLL_INTERVAL_MS;
	const now = options.now ?? Date.now;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

	const start = now();
	// Poll the terminal manager until the pty process exits or we hit the
	// deadline. The exit edge is the same one that fires `terminal:lifecycle`.
	while (!port.hasExited(args.terminalId, args.workspaceId)) {
		if (now() - start >= deadlineMs) break;
		await sleep(pollIntervalMs);
	}

	const buffer = port.readBuffer(args.terminalId, args.workspaceId);
	if (buffer === null) return null;

	return extractTerminalOutputTail(buffer, {
		...(args.echoedCommand !== undefined
			? { echoedCommand: args.echoedCommand }
			: {}),
		...(options.maxTailLines !== undefined
			? { maxLines: options.maxTailLines }
			: {}),
	});
}

/** Starts the agent in the workspace (chat or CLI). Injectable for tests; the
 * default is the real {@link runAgentInWorkspace}. */
export type StartAgentPort = (
	ctx: HostServiceContext,
	input: AgentRunInput,
) => Promise<AgentRunResult>;

/** Injectable ports for {@link runAgentAndCapture} (default to live wiring). */
export interface RunAgentAndCapturePorts {
	/** Starts the agent (chat session / pty CLI). Default: {@link runAgentInWorkspace}. */
	startAgent?: StartAgentPort;
	/** Reads the terminal exit state + scrollback. Default: {@link defaultTerminalCapturePort}. */
	terminalPort?: TerminalCapturePort;
}

/**
 * Start an agent in the workspace, wait for completion, and capture its output.
 *
 * Chat agents run in the host chat runtime (fire-and-forget `sendMessage`), so
 * we poll the session snapshot for the settled assistant turn. Terminal agents
 * spawn a CLI in a pty; we wait for the process to exit then read + extract the
 * scrollback tail via {@link captureTerminalOutput}.
 *
 * Both ports are injectable for tests; production uses the live
 * {@link runAgentInWorkspace} + {@link defaultTerminalCapturePort}. The captured
 * `{ kind, sessionId, message, artifacts? }` is exactly what the cloud host
 * bridge (`agent-run-host-bridge`) round-trips back into the pipeline's
 * accumulating context.
 */
export async function runAgentAndCapture(
	ctx: HostServiceContext,
	input: AgentRunCaptureInput,
	ports: RunAgentAndCapturePorts = {},
): Promise<AgentRunCaptureResult> {
	const startAgent = ports.startAgent ?? runAgentInWorkspace;
	const terminalPort = ports.terminalPort ?? defaultTerminalCapturePort;
	const boundedInput = {
		...input,
		maxTurns: normalizeAgentCaptureMaxTurns(input.maxTurns),
	};
	const started = await startAgent(ctx, boundedInput);

	if (started.kind === "chat") {
		const message = await captureChatOutput(async () => {
			// The host chat runtime exposes a combined snapshot (displayState +
			// messages). A turn is settled when the harness is not actively running
			// and has no pending question/permission gate.
			const snapshot = await ctx.runtime.chat.getSnapshot({
				sessionId: started.sessionId,
				workspaceId: boundedInput.workspaceId,
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

	// Terminal CLI agent: the process runs in a pty. Wait for the
	// `terminal:lifecycle` exit edge (observed via the terminal manager's
	// session state), then read the scrollback ring buffer and extract its
	// meaningful tail. Thread the exact queued command so the extractor strips
	// the shell-echoed command line from the captured output.
	const captured = await captureTerminalOutput(terminalPort, {
		terminalId: started.sessionId,
		workspaceId: boundedInput.workspaceId,
		echoedCommand: started.command,
	});

	// `null` ⇒ the pty session was unknown to this process (never created /
	// already reaped — see `defaultTerminalCapturePort.readBuffer`). Emit a
	// deterministic, typed marker so the run still completes with a real
	// sessionId/childRunRef rather than throwing. A real (possibly empty) buffer
	// flows through as the extracted tail.
	const message =
		captured === null
			? `[terminal agent ${boundedInput.agent}] dispatched; terminal session not readable from host`
			: captured;

	return {
		kind: "terminal",
		sessionId: started.sessionId,
		message,
	};
}
