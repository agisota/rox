import { describe, expect, test } from "bun:test";
import type { HostServiceContext } from "../../../types";
import {
	type AgentRunCaptureInput,
	captureChatOutput,
	captureTerminalOutput,
	defaultTerminalCapturePort,
	extractAssistantText,
	extractMessageText,
	runAgentAndCapture,
	type StartAgentPort,
	type TerminalCapturePort,
} from "./agent-run-capture";

describe("extractMessageText", () => {
	test("ARC-01: returns a raw string body unchanged", () => {
		expect(extractMessageText("hello")).toBe("hello");
	});

	test("ARC-02: joins text parts, ignoring tool/image parts", () => {
		const content = [
			{ type: "text", text: "approved" },
			{ type: "tool-call", toolName: "noop" },
			{ type: "text", text: " — looks good" },
			{ type: "image", url: "data:..." },
		];
		expect(extractMessageText(content)).toBe("approved — looks good");
	});

	test("ARC-03: non-array, non-string content yields empty string", () => {
		expect(extractMessageText(undefined)).toBe("");
		expect(extractMessageText(null)).toBe("");
		expect(extractMessageText({ type: "text", text: "x" })).toBe("");
	});
});

describe("extractAssistantText", () => {
	test("ARC-04: returns the latest assistant turn, trimmed", () => {
		const messages = [
			{ role: "user", content: [{ type: "text", text: "do it" }] },
			{ role: "assistant", content: [{ type: "text", text: "first" }] },
			{ role: "user", content: [{ type: "text", text: "again" }] },
			{ role: "assistant", content: [{ type: "text", text: "  final  " }] },
		];
		expect(extractAssistantText(messages)).toBe("final");
	});

	test("ARC-05: returns empty string when there is no assistant message", () => {
		const messages = [
			{ role: "user", content: [{ type: "text", text: "hi" }] },
		];
		expect(extractAssistantText(messages)).toBe("");
		expect(extractAssistantText([])).toBe("");
	});
});

describe("captureChatOutput", () => {
	const noSleep = async () => {};

	test("ARC-06: returns assistant text once the turn settles", async () => {
		const snapshots: Array<{ settled: boolean; messages: unknown[] }> = [
			{ settled: false, messages: [] },
			{
				settled: false,
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "partial" }] },
				],
			},
			{
				settled: true,
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "done" }] },
				],
			},
		];
		const clock = { t: 0 };
		const text = await captureChatOutput(
			async () => snapshots.shift() ?? { settled: true, messages: [] },
			{
				sleep: noSleep,
				pollIntervalMs: 1,
				deadlineMs: 1000,
				now: () => {
					const t = clock.t;
					clock.t += 1;
					return t;
				},
			},
		);
		expect(text).toBe("done");
	});

	test("ARC-07: does not settle on an empty assistant turn", async () => {
		// settled:true but no assistant message yet → keep polling until deadline,
		// then return the last captured text (empty here).
		let calls = 0;
		const clock = { t: 0 };
		const text = await captureChatOutput(
			async () => {
				calls++;
				return { settled: true, messages: [] as unknown[] };
			},
			{
				sleep: noSleep,
				pollIntervalMs: 10,
				deadlineMs: 30,
				now: () => {
					const t = clock.t;
					clock.t += 10;
					return t;
				},
			},
		);
		expect(text).toBe("");
		expect(calls).toBeGreaterThan(0);
	});

	test("ARC-08: returns the last captured text when the deadline is hit while still running", async () => {
		const clock = { t: 0 };
		const text = await captureChatOutput(
			async () => ({
				settled: false, // never settles
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "streaming…" }],
					},
				],
			}),
			{
				sleep: noSleep,
				pollIntervalMs: 10,
				deadlineMs: 25,
				now: () => {
					const t = clock.t;
					clock.t += 10;
					return t;
				},
			},
		);
		expect(text).toBe("streaming…");
	});
});

describe("captureTerminalOutput", () => {
	const noSleep = async () => {};
	const ESC = "\x1b";

	test("ARC-09: waits for exit, then reads + extracts the scrollback tail", async () => {
		// Session reports running for the first 2 polls, then exited.
		let polls = 0;
		const port: TerminalCapturePort = {
			hasExited() {
				polls += 1;
				return polls >= 3;
			},
			readBuffer() {
				return [
					new TextEncoder().encode(`user@host:~/repo$ claude --print 'go'\n`),
					new TextEncoder().encode(`${ESC}[32mAll checks passed.${ESC}[0m\n`),
					new TextEncoder().encode("user@host:~/repo$ "),
				];
			},
		};
		const out = await captureTerminalOutput(
			port,
			{
				terminalId: "t-1",
				workspaceId: "w-1",
				echoedCommand: "claude --print 'go'",
			},
			{ sleep: noSleep, pollIntervalMs: 1, deadlineMs: 1000 },
		);
		expect(out).toBe("All checks passed.");
		expect(polls).toBeGreaterThanOrEqual(3);
	});

	test("ARC-10: returns null when no buffer is readable (port read-back unwired)", async () => {
		const port: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => null,
		};
		const out = await captureTerminalOutput(
			port,
			{ terminalId: "t-2", workspaceId: "w-1" },
			{ sleep: noSleep, pollIntervalMs: 1, deadlineMs: 100 },
		);
		expect(out).toBeNull();
	});

	test("ARC-11: reads the buffer anyway when the exit deadline is hit", async () => {
		const clock = { t: 0 };
		let reads = 0;
		const port: TerminalCapturePort = {
			hasExited: () => false, // never exits
			readBuffer() {
				reads += 1;
				return "partial output before timeout\n";
			},
		};
		const out = await captureTerminalOutput(
			port,
			{ terminalId: "t-3", workspaceId: "w-1" },
			{
				sleep: noSleep,
				pollIntervalMs: 10,
				deadlineMs: 25,
				now: () => {
					const t = clock.t;
					clock.t += 10;
					return t;
				},
			},
		);
		expect(out).toBe("partial output before timeout");
		expect(reads).toBe(1);
	});

	test("ARC-12: empty buffer extracts to empty string (maps to AGENT_NO_OUTPUT upstream)", async () => {
		const port: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => "",
		};
		const out = await captureTerminalOutput(
			port,
			{ terminalId: "t-4", workspaceId: "w-1" },
			{ sleep: noSleep, pollIntervalMs: 1, deadlineMs: 100 },
		);
		expect(out).toBe("");
	});

	test("ARC-13: honors maxTailLines when threading output into pipeline context", async () => {
		const lines = Array.from({ length: 6 }, (_, i) => `out ${i + 1}`).join(
			"\n",
		);
		const port: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => lines,
		};
		const out = await captureTerminalOutput(
			port,
			{ terminalId: "t-5", workspaceId: "w-1" },
			{
				sleep: noSleep,
				pollIntervalMs: 1,
				deadlineMs: 100,
				maxTailLines: 2,
			},
		);
		expect(out).toBe("out 5\nout 6");
	});
});

describe("defaultTerminalCapturePort (live wiring, no daemon)", () => {
	// These exercise the REAL wired port against the live terminal-session map.
	// In a headless test there is no pty-daemon, so the map is empty — which is
	// exactly the "unknown session" edge we must handle safely (no infinite poll,
	// no throw). A true populated-buffer read requires a running pty-daemon and is
	// covered functionally post-merge; the bytes→tail path itself is proven by
	// ARC-09 via an injected port returning the same `Uint8Array[]` shape this
	// port's `readBuffer` returns.

	test("ARC-14: hasExited returns true for an unknown terminal (no infinite poll)", () => {
		expect(
			defaultTerminalCapturePort.hasExited("never-created", "workspace-none"),
		).toBe(true);
	});

	test("ARC-15: readBuffer returns null for an unknown terminal (maps to dispatched marker)", () => {
		expect(
			defaultTerminalCapturePort.readBuffer("never-created", "workspace-none"),
		).toBeNull();
	});

	test("ARC-16: captureTerminalOutput with the live port + unknown terminal yields null without hanging", async () => {
		// Unknown terminal ⇒ hasExited=true (loop exits immediately) and
		// readBuffer=null (no buffer) ⇒ the orchestrator returns null, which the
		// host handler maps to the typed dispatched marker.
		const out = await captureTerminalOutput(defaultTerminalCapturePort, {
			terminalId: "never-created",
			workspaceId: "workspace-none",
		});
		expect(out).toBeNull();
	});
});

describe("runAgentAndCapture — host handler orchestration contract", () => {
	const ESC = "\x1b";

	const input: AgentRunCaptureInput = {
		workspaceId: "ws-1",
		agent: "rox",
		prompt: "do the thing",
		maxTurns: 4,
	};

	/** Build a minimal HostServiceContext whose chat runtime returns one settled
	 * assistant turn. Only `runtime.chat.getSnapshot` is exercised (the agent
	 * start is injected via the `startAgent` port). */
	function chatCtx(assistantText: string): HostServiceContext {
		return {
			runtime: {
				chat: {
					getSnapshot: async () => ({
						displayState: { isRunning: false, pendingQuestion: null },
						messages: [
							{
								role: "user",
								content: [{ type: "text", text: "do the thing" }],
							},
							{
								role: "assistant",
								content: [{ type: "text", text: assistantText }],
							},
						],
					}),
				},
			},
		} as unknown as HostServiceContext;
	}

	const noCtx = {} as unknown as HostServiceContext;

	test("ARC-17: chat role threads the settled assistant turn into the result shape", async () => {
		const startAgent: StartAgentPort = async () => ({
			kind: "chat",
			sessionId: "sess-chat",
			label: "Rox",
		});
		const result = await runAgentAndCapture(
			chatCtx("approved — ship it"),
			input,
			{
				startAgent,
			},
		);
		// This is exactly the shape the cloud bridge round-trips into context.
		expect(result).toEqual({
			kind: "chat",
			sessionId: "sess-chat",
			message: "approved — ship it",
		});
	});

	test("ARC-18: terminal role strips the echoed command + ANSI and extracts the tail", async () => {
		// The handler threads `started.command` as the echoed command, so the
		// shell-echoed command line is dropped from the captured output.
		const startAgent: StartAgentPort = async () => ({
			kind: "terminal",
			sessionId: "term-1",
			label: "Claude CLI",
			command: "claude --print 'go'",
		});
		const terminalPort: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => [
				new TextEncoder().encode(`user@host:~/repo$ claude --print 'go'\n`),
				new TextEncoder().encode(`${ESC}[32mAll checks passed.${ESC}[0m\n`),
				new TextEncoder().encode("user@host:~/repo$ "),
			],
		};
		const result = await runAgentAndCapture(
			noCtx,
			{ ...input, agent: "claude" },
			{ startAgent, terminalPort },
		);
		expect(result.kind).toBe("terminal");
		expect(result.sessionId).toBe("term-1");
		// Echoed command line dropped, ANSI stripped, trailing prompt dropped →
		// meaningful tail only.
		expect(result.message).toBe("All checks passed.");
	});

	test("ARC-19: terminal role with an unreadable buffer falls back to the typed dispatched marker", async () => {
		const startAgent: StartAgentPort = async () => ({
			kind: "terminal",
			sessionId: "term-2",
			label: "Claude CLI",
			command: "claude --print 'go'",
		});
		const terminalPort: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => null,
		};
		const result = await runAgentAndCapture(
			noCtx,
			{ ...input, agent: "claude" },
			{ startAgent, terminalPort },
		);
		expect(result.kind).toBe("terminal");
		expect(result.sessionId).toBe("term-2");
		// Deterministic marker (mapped to AGENT-level handling upstream); the run
		// still completes with a real sessionId/childRunRef rather than throwing.
		expect(result.message).toContain("[terminal agent claude]");
	});

	test("ARC-20: terminal role with an empty buffer yields an empty message (→ AGENT_NO_OUTPUT upstream)", async () => {
		const startAgent: StartAgentPort = async () => ({
			kind: "terminal",
			sessionId: "term-3",
			label: "Claude CLI",
			command: "claude --print 'go'",
		});
		const terminalPort: TerminalCapturePort = {
			hasExited: () => true,
			readBuffer: () => "",
		};
		const result = await runAgentAndCapture(
			noCtx,
			{ ...input, agent: "claude" },
			{ startAgent, terminalPort },
		);
		expect(result.message).toBe("");
	});
});
