import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import { isStructuralChange } from "./graph-diff";

function state(over: Partial<RoxWorkflowState> = {}): RoxWorkflowState {
	return {
		id: "p",
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 0, y: 0 } },
			a: { type: "agent_run", name: "A", position: { x: 10, y: 10 } },
		},
		edges: [{ id: "start->a", source: "start", target: "a" }],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "P" },
		...over,
	};
}

describe("isStructuralChange", () => {
	test("position-only move is NOT structural (no undo checkpoint)", () => {
		const a = state();
		const b = state({
			blocks: {
				start: { type: "start", name: "Старт", position: { x: 0, y: 0 } },
				a: { type: "agent_run", name: "A", position: { x: 500, y: 500 } },
			},
		});
		expect(isStructuralChange(a, b)).toBe(false);
	});

	test("adding a block is structural", () => {
		const a = state();
		const b = state({
			blocks: {
				...a.blocks,
				c: { type: "response", name: "C", position: { x: 0, y: 0 } },
			},
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("removing a block is structural", () => {
		const a = state();
		const b = state({
			blocks: { start: { type: "start", name: "Старт" } },
			edges: [],
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("renaming a block is structural", () => {
		const a = state();
		const b = state({
			blocks: {
				start: { type: "start", name: "Старт" },
				a: { type: "agent_run", name: "Renamed", position: { x: 10, y: 10 } },
			},
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("toggling enabled is structural", () => {
		const a = state();
		const b = state({
			blocks: {
				start: { type: "start", name: "Старт" },
				a: {
					type: "agent_run",
					name: "A",
					enabled: false,
					position: { x: 10, y: 10 },
				},
			},
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("changing subBlocks is structural", () => {
		const a = state();
		const b = state({
			blocks: {
				start: { type: "start", name: "Старт" },
				a: {
					type: "agent_run",
					name: "A",
					subBlocks: { roleSlug: "critic" },
					position: { x: 10, y: 10 },
				},
			},
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("adding/removing an edge is structural", () => {
		const a = state();
		const b = state({ edges: [] });
		expect(isStructuralChange(a, b)).toBe(true);
	});

	test("changing an edge branch handle is structural", () => {
		const a = state();
		const b = state({
			edges: [
				{
					id: "start->a",
					source: "start",
					target: "a",
					sourceHandle: "approved",
				},
			],
		});
		expect(isStructuralChange(a, b)).toBe(true);
	});
});
