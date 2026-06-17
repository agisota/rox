import { describe, expect, test } from "bun:test";
import {
	captureChatOutput,
	extractAssistantText,
	extractMessageText,
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
