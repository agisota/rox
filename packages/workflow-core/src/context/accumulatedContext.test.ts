import { describe, expect, test } from "bun:test";
import {
	type AccumulatedContext,
	appendContextEntry,
	type ContextEntry,
	createAccumulatedContext,
	renderContextForPrompt,
} from "./accumulatedContext";

/**
 * Characterization tests for the pure accumulating-context helpers used to
 * thread a pipeline run's append-only transcript through agent nodes.
 */

function entry(overrides: Partial<ContextEntry> = {}): ContextEntry {
	return {
		nodeId: "node-1",
		role: "critic",
		agentId: "claude",
		message: "first output",
		at: "2026-06-25T00:00:00.000Z",
		...overrides,
	};
}

describe("createAccumulatedContext", () => {
	test("seeds the originating message with an empty transcript", () => {
		const ctx = createAccumulatedContext("kick off the run");
		expect(ctx).toEqual({ seedMessage: "kick off the run", entries: [] });
	});
});

describe("appendContextEntry", () => {
	test("returns a NEW context and leaves the original unchanged", () => {
		const original = createAccumulatedContext("seed");
		const next = appendContextEntry(original, entry());

		expect(next).not.toBe(original);
		expect(next.entries).not.toBe(original.entries);
		// Immutability: the source context is untouched.
		expect(original.entries).toEqual([]);
		expect(next.entries).toHaveLength(1);
		expect(next.seedMessage).toBe("seed");
	});

	test("accumulates multiple appends in insertion order", () => {
		const ctx0 = createAccumulatedContext("seed");
		const e1 = entry({ nodeId: "n1", message: "one" });
		const e2 = entry({ nodeId: "n2", message: "two" });
		const ctx2 = appendContextEntry(appendContextEntry(ctx0, e1), e2);

		expect(ctx2.entries).toEqual([e1, e2]);
	});

	test("preserves optional artifact references on the entry", () => {
		const ctx = appendContextEntry(
			createAccumulatedContext("seed"),
			entry({ artifacts: [{ kind: "patch", ref: "diff://1" }] }),
		);
		expect(ctx.entries[0]?.artifacts).toEqual([
			{ kind: "patch", ref: "diff://1" },
		]);
	});
});

describe("renderContextForPrompt", () => {
	test("renders only the seed section when there are no entries", () => {
		const ctx = createAccumulatedContext("just the seed");
		expect(renderContextForPrompt(ctx)).toBe("# Seed\njust the seed");
	});

	test("appends a Transcript section with one heading per entry", () => {
		const ctx: AccumulatedContext = {
			seedMessage: "seed text",
			entries: [
				entry({ role: "critic", agentId: "claude", message: "review notes" }),
				entry({ role: "builder", agentId: "codex", message: "patch applied" }),
			],
		};
		const rendered = renderContextForPrompt(ctx);
		expect(rendered).toBe(
			[
				"# Seed",
				"seed text",
				"",
				"# Transcript",
				"",
				"## critic (claude)",
				"review notes",
				"",
				"## builder (codex)",
				"patch applied",
			].join("\n"),
		);
	});

	test("an empty-seed context still renders sanely", () => {
		expect(renderContextForPrompt(createAccumulatedContext(""))).toBe(
			"# Seed\n",
		);
	});
});
