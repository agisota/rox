import { describe, expect, test } from "bun:test";
import {
	getNodeType,
	type RoxWorkflowState,
	validateGraph,
} from "@rox/workflow-core";
import { PIPELINE_TEMPLATES } from "../templates";
import {
	buildTemplateFromState,
	insertTemplate,
	isEmptyCanvas,
} from "./templateGraph";

/** Validate with the registry resolver — the strictest check the editor can do. */
function validate(state: RoxWorkflowState) {
	return validateGraph(state, { resolveNodeType: getNodeType });
}

/** A small but non-empty existing graph: start → one agent. */
function existingGraph(): RoxWorkflowState {
	return {
		id: "p1",
		blocks: {
			start: { type: "start", name: "Старт", position: { x: 80, y: 240 } },
			improve: {
				type: "agent_run",
				name: "Промпт-инженер",
				position: { x: 340, y: 240 },
				subBlocks: { roleSlug: "prompt-improver" },
			},
		},
		edges: [{ id: "e1", source: "start", target: "improve" }],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "Существующий" },
	};
}

function byId(id: string) {
	const found = PIPELINE_TEMPLATES.find((t) => t.id === id);
	if (!found) throw new Error(`template "${id}" not found`);
	return found;
}

describe("isEmptyCanvas", () => {
	test("start-only graph is empty", () => {
		expect(
			isEmptyCanvas({
				blocks: { start: { type: "start" } },
				edges: [],
				variables: {},
				loops: {},
				parallels: {},
				metadata: { name: "x" },
			}),
		).toBe(true);
	});

	test("graph with a second node is not empty", () => {
		expect(isEmptyCanvas(existingGraph())).toBe(false);
	});
});

describe("insertTemplate", () => {
	// Every non-blank template inserted into a non-empty canvas must keep a single
	// start, avoid id collisions, stay connected, and validate.
	const insertable = PIPELINE_TEMPLATES.filter((t) => t.id !== "blank");

	for (const template of insertable) {
		test(`inserts "${template.id}" without id collision, stays valid`, () => {
			const prev = existingGraph();
			const prevIds = new Set(Object.keys(prev.blocks));
			const tpl = template.build();

			// Anchor on the existing reachable tail (the agent node).
			const { state, insertedIds } = insertTemplate(prev, tpl, "improve");

			// 1. No id collisions: inserted ids are disjoint from existing ids.
			for (const id of insertedIds) {
				expect(prevIds.has(id)).toBe(false);
				expect(state.blocks[id]).toBeDefined();
			}

			// 2. Existing blocks survive untouched.
			for (const id of prevIds) expect(state.blocks[id]).toBeDefined();

			// 3. Exactly one start (the template's start was dropped).
			const starts = Object.values(state.blocks).filter(
				(b) => b.type === "start",
			);
			expect(starts.length).toBe(1);

			// 4. Every inserted block is reachable + the graph validates.
			const result = validate(state);
			expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
			expect(result.valid).toBe(true);
		});
	}

	test("inserted blocks are offset clear of the existing graph", () => {
		const prev = existingGraph(); // right edge x = 340
		const { state, insertedIds } = insertTemplate(
			prev,
			byId("rag-bot").build(),
			"improve",
		);
		for (const id of insertedIds) {
			const x = state.blocks[id]?.position?.x ?? 0;
			expect(x).toBeGreaterThan(340);
		}
	});

	test("a second insert of the same template does not collide with the first", () => {
		const prev = existingGraph();
		const first = insertTemplate(prev, byId("rag-bot").build(), "improve");
		const second = insertTemplate(
			first.state,
			byId("rag-bot").build(),
			"improve",
		);
		// Combined inserted ids are all distinct and all present.
		const all = [...first.insertedIds, ...second.insertedIds];
		expect(new Set(all).size).toBe(all.length);
		expect(validate(second.state).valid).toBe(true);
	});
});

describe("buildTemplateFromState (Save as template)", () => {
	test("round-trips the current graph back into a valid graph", () => {
		// Start from a known-good template's graph, save it, re-build.
		const original = byId("refine-decompose").build();
		const saved = buildTemplateFromState(original, {
			id: "my-template",
			name: "Мой шаблон",
			description: "Сохранён из редактора.",
			slugSeed: "my-template",
		});

		const rebuilt = saved.build();
		expect(validate(rebuilt).valid).toBe(true);
		// Same block set + edge count survive the round-trip.
		expect(Object.keys(rebuilt.blocks).sort()).toEqual(
			Object.keys(original.blocks).sort(),
		);
		expect(rebuilt.edges.length).toBe(original.edges.length);
	});

	test("build() returns an independent deep copy each call", () => {
		const saved = buildTemplateFromState(existingGraph(), {
			id: "t",
			name: "T",
			description: "d",
			slugSeed: "t",
		});
		const a = saved.build();
		const b = saved.build();
		expect(a).not.toBe(b);
		expect(a.blocks).not.toBe(b.blocks);
		// Mutating one copy never leaks into the next.
		a.blocks.start.name = "MUTATED";
		expect(b.blocks.start?.name).not.toBe("MUTATED");
	});

	test("a saved template can be inserted back into a canvas", () => {
		const saved = buildTemplateFromState(byId("rag-bot").build(), {
			id: "saved-rag",
			name: "Сохранённый RAG",
			description: "d",
			slugSeed: "saved-rag",
		});
		const { state } = insertTemplate(existingGraph(), saved.build(), "improve");
		expect(validate(state).valid).toBe(true);
	});
});
