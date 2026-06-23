import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import {
	buildNodeDelete,
	buildNodePatch,
	clampMaxIterations,
	countStartBlocks,
	isStartBlock,
	sanitizeName,
} from "./nodePatch";

const baseState = {
	id: "pipeline-1",
	blocks: {
		start: { type: "start", name: "Старт", position: { x: 0, y: 0 } },
		agent: {
			type: "agent_run",
			name: "Агент",
			enabled: true,
			position: { x: 200, y: 0 },
			subBlocks: { roleSlug: "critic", temperature: 0.2 },
		},
		loop: {
			type: "loop",
			name: "Цикл",
			position: { x: 400, y: 0 },
		},
	},
	edges: [
		{ id: "e1", source: "start", target: "agent" },
		{ id: "e2", source: "agent", target: "loop" },
	],
	variables: {},
	loops: { l1: { nodes: ["agent", "loop"], maxIterations: 3 } },
	parallels: {},
	metadata: { name: "Spec pipeline" },
} satisfies RoxWorkflowState;

describe("sanitizeName", () => {
	test("trims a valid name", () => {
		expect(sanitizeName("  Новый агент  ")).toBe("Новый агент");
	});
	test("rejects empty / whitespace-only (revert signal)", () => {
		expect(sanitizeName("")).toBeNull();
		expect(sanitizeName("   ")).toBeNull();
	});
	test("clamps to 120 chars", () => {
		expect(sanitizeName("a".repeat(200))?.length).toBe(120);
	});
});

describe("clampMaxIterations", () => {
	test("blank / non-numeric → null (delete key)", () => {
		expect(clampMaxIterations("")).toBeNull();
		expect(clampMaxIterations("abc")).toBeNull();
		expect(clampMaxIterations("  ")).toBeNull();
	});
	test("clamps below 1 up to 1 and above 200 down to 200", () => {
		expect(clampMaxIterations("0")).toBe(1);
		expect(clampMaxIterations("-5")).toBe(1);
		expect(clampMaxIterations("999")).toBe(200);
	});
	test("rounds floats to integers", () => {
		expect(clampMaxIterations("3.7")).toBe(4);
		expect(clampMaxIterations("5")).toBe(5);
	});
});

describe("isStartBlock / countStartBlocks", () => {
	test("identifies the start block", () => {
		expect(isStartBlock(baseState.blocks.start)).toBe(true);
		expect(isStartBlock(baseState.blocks.agent)).toBe(false);
		expect(isStartBlock(undefined)).toBe(false);
	});
	test("counts start blocks (guards MULTIPLE_START_BLOCKS)", () => {
		expect(countStartBlocks(baseState)).toBe(1);
	});
});

describe("buildNodePatch", () => {
	test("renames a block and preserves everything else", () => {
		const next = buildNodePatch(baseState, "agent", { name: "  Критик  " });
		expect(next).not.toBe(baseState);
		expect(next.blocks.agent.name).toBe("Критик");
		expect(next.blocks.agent.subBlocks).toEqual({
			roleSlug: "critic",
			temperature: 0.2,
		});
		// Untouched blocks keep identity.
		expect(next.blocks.start).toBe(baseState.blocks.start);
		expect(next.edges).toBe(baseState.edges);
	});

	test("empty rename is a no-op (returns same reference → revert)", () => {
		expect(buildNodePatch(baseState, "agent", { name: "   " })).toBe(baseState);
	});

	test("toggles enabled", () => {
		const next = buildNodePatch(baseState, "agent", { enabled: false });
		expect(next.blocks.agent.enabled).toBe(false);
	});

	test("merges subBlocksPatch and removes deleteSubBlockKeys", () => {
		const next = buildNodePatch(baseState, "agent", {
			subBlocksPatch: { roleSlug: "orchestrator", maxTurns: 4 },
			deleteSubBlockKeys: ["temperature"],
		});
		expect(next.blocks.agent.subBlocks).toEqual({
			roleSlug: "orchestrator",
			maxTurns: 4,
		});
	});

	test("deleting the last subBlock key drops subBlocks entirely", () => {
		const next = buildNodePatch(baseState, "loop", {
			subBlocksPatch: { maxIterations: 5 },
		});
		expect(next.blocks.loop.subBlocks).toEqual({ maxIterations: 5 });
		const cleared = buildNodePatch(next, "loop", {
			deleteSubBlockKeys: ["maxIterations"],
		});
		expect(cleared.blocks.loop.subBlocks).toBeUndefined();
	});

	test("missing block → same reference", () => {
		expect(buildNodePatch(baseState, "nope", { name: "x" })).toBe(baseState);
	});

	test("no-op patch (same enabled value) → same reference", () => {
		expect(buildNodePatch(baseState, "agent", { enabled: true })).toBe(
			baseState,
		);
	});
});

describe("buildNodeDelete", () => {
	test("removes a node and prunes its edges + loop membership", () => {
		const result = buildNodeDelete(baseState, "agent");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.state.blocks.agent).toBeUndefined();
		expect(result.state.edges).toEqual([]);
		expect(result.state.loops.l1.nodes).toEqual(["loop"]);
		// Other blocks survive.
		expect(result.state.blocks.start).toBe(baseState.blocks.start);
	});

	test("refuses to delete the sole start block", () => {
		const result = buildNodeDelete(baseState, "start");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("start_protected");
	});

	test("reports missing blocks", () => {
		const result = buildNodeDelete(baseState, "ghost");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("missing");
	});
});
