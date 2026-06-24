import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { autoLayoutGraph } from "./auto-layout";

function baseState(): RoxWorkflowState {
	return {
		id: "p1",
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 999, y: 999 } },
			a: { type: "agent_run", name: "A", position: { x: 0, y: 0 } },
			b: { type: "response", name: "B", position: { x: 0, y: 0 } },
		},
		edges: [
			{ id: "start->a", source: "start", target: "a" },
			{ id: "a->b", source: "a", target: "b" },
		],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "P1" },
	};
}

describe("autoLayoutGraph", () => {
	test("returns the same reference for an empty graph", () => {
		const empty: RoxWorkflowState = {
			blocks: {},
			edges: [],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "x" },
		};
		expect(autoLayoutGraph(empty)).toBe(empty);
	});

	test("assigns a position to every block", () => {
		const out = autoLayoutGraph(baseState());
		for (const id of ["start", "a", "b"]) {
			const pos = out.blocks[id]?.position;
			expect(pos).toBeDefined();
			expect(Number.isFinite(pos?.x)).toBe(true);
			expect(Number.isFinite(pos?.y)).toBe(true);
		}
	});

	test("lays the chain out left-to-right (start.x < a.x < b.x)", () => {
		const out = autoLayoutGraph(baseState());
		const sx = out.blocks.start?.position?.x ?? 0;
		const ax = out.blocks.a?.position?.x ?? 0;
		const bx = out.blocks.b?.position?.x ?? 0;
		expect(sx).toBeLessThan(ax);
		expect(ax).toBeLessThan(bx);
	});

	test("preserves block names, types, and edges", () => {
		const out = autoLayoutGraph(baseState());
		expect(out.blocks.a?.name).toBe("A");
		expect(out.blocks.a?.type).toBe("agent_run");
		expect(out.edges).toHaveLength(2);
	});

	test("does not throw on an edge with a missing endpoint", () => {
		const s = baseState();
		s.edges.push({ id: "a->ghost", source: "a", target: "ghost" });
		expect(() => autoLayoutGraph(s)).not.toThrow();
	});
});
