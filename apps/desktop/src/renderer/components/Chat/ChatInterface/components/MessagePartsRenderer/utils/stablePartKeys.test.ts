import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";
import { computeStablePartKeys } from "./stablePartKeys";

type Part = UIMessage["parts"][number];

function textPart(text: string): Part {
	return { type: "text", text } as Part;
}

function reasoningPart(text: string): Part {
	return { type: "reasoning", text } as Part;
}

function toolPart(toolName: string, toolCallId: string): Part {
	return {
		type: `tool-${toolName}`,
		toolCallId,
		state: "input-available",
		input: {},
	} as unknown as Part;
}

describe("computeStablePartKeys", () => {
	it("keys tool parts by their toolCallId", () => {
		const keys = computeStablePartKeys([
			toolPart("list_files", "call_a"),
			toolPart("read_file", "call_b"),
		]);
		expect(keys).toEqual(["tool-call_a", "tool-call_b"]);
	});

	it("keys non-tool parts by type + per-type ordinal", () => {
		const keys = computeStablePartKeys([
			textPart("one"),
			reasoningPart("think"),
			textPart("two"),
		]);
		expect(keys).toEqual(["text-0", "reasoning-0", "text-1"]);
	});

	it("produces unique keys for every part", () => {
		const keys = computeStablePartKeys([
			textPart("a"),
			toolPart("search", "call_1"),
			textPart("b"),
			toolPart("search", "call_2"),
			reasoningPart("r"),
		]);
		expect(new Set(keys).size).toBe(keys.length);
	});

	// The core jitter invariant: appending parts during streaming must NOT change
	// the key of any already-present part. A changed key remounts the row and
	// replays its entrance animation (the vertical jump we are fixing).
	it("keeps existing keys stable as the read-only run grows during streaming", () => {
		const t0 = [textPart("intro"), toolPart("list_files", "call_a")];
		const t1 = [
			textPart("intro"),
			toolPart("list_files", "call_a"),
			toolPart("read_file", "call_b"),
		];
		const t2 = [
			textPart("intro"),
			toolPart("list_files", "call_a"),
			toolPart("read_file", "call_b"),
			toolPart("search", "call_c"),
			textPart("after"),
		];

		const k0 = computeStablePartKeys(t0);
		const k1 = computeStablePartKeys(t1);
		const k2 = computeStablePartKeys(t2);

		// Every key that existed at t0 is unchanged at t1 and t2.
		expect(k1.slice(0, k0.length)).toEqual(k0);
		expect(k2.slice(0, k1.length)).toEqual(k1);
		// The first read-only tool — which anchors the ExploringGroup key — never
		// changes identity as later read-only tools join the run.
		expect(k0[1]).toBe("tool-call_a");
		expect(k2[1]).toBe("tool-call_a");
	});

	it("keeps the trailing text part's key stable while its text streams in", () => {
		const partial = [toolPart("read_file", "call_a"), textPart("Hel")];
		const full = [toolPart("read_file", "call_a"), textPart("Hello world")];
		expect(computeStablePartKeys(partial)).toEqual(computeStablePartKeys(full));
	});

	it("falls back to a non-index key when a tool part lacks a toolCallId", () => {
		const orphan = {
			type: "tool-list_files",
			state: "input-streaming",
			input: {},
		} as unknown as Part;
		const keys = computeStablePartKeys([orphan, orphan]);
		// Stable, unique, and not the bare array index.
		expect(keys[0]).toBe("tool-list_files-0");
		expect(keys[1]).toBe("tool-list_files-1");
	});
});
