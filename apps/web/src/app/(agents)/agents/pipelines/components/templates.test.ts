import { describe, expect, test } from "bun:test";
import {
	getNodeType,
	isRegisteredNodeType,
	validateGraph,
} from "@rox/workflow-core";
import { PIPELINE_TEMPLATES, ROLE_TEMPLATES } from "./templates";

describe("pipeline templates gallery", () => {
	test("ships many templates spanning multiple categories", () => {
		expect(PIPELINE_TEMPLATES.length).toBeGreaterThanOrEqual(10);
		const categories = new Set(
			PIPELINE_TEMPLATES.map((t) => t.category).filter(Boolean),
		);
		// Catalog-spanning gallery: ИИ, Логика, Данные, Агенты at minimum.
		expect(categories.size).toBeGreaterThanOrEqual(4);
	});

	test("every template has a unique id and a builder", () => {
		const ids = PIPELINE_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const t of PIPELINE_TEMPLATES) {
			expect(typeof t.build).toBe("function");
		}
	});

	test("every template builds a graph whose block types are registered", () => {
		for (const t of PIPELINE_TEMPLATES) {
			const graph = t.build();
			for (const b of Object.values(graph.blocks)) {
				expect(isRegisteredNodeType(b.type)).toBe(true);
			}
		}
	});

	test("every template builds a graph that validates against the registry", () => {
		for (const t of PIPELINE_TEMPLATES) {
			const graph = t.build();
			const result = validateGraph(graph, { resolveNodeType: getNodeType });
			// Surface the offending template + issues if this ever regresses.
			if (!result.valid) {
				throw new Error(
					`Template "${t.id}" is invalid: ${result.issues
						.map((i) => `${i.code}@${i.blockId}:${i.path ?? ""}`)
						.join(", ")}`,
				);
			}
			expect(result.valid).toBe(true);
		}
	});

	test("every template has exactly one start node", () => {
		for (const t of PIPELINE_TEMPLATES) {
			const starts = Object.values(t.build().blocks).filter(
				(b) => b.type === "start",
			);
			expect(starts.length).toBe(1);
		}
	});

	test("templates exercise the new catalog node types (not just the legacy 5)", () => {
		const allTypes = new Set<string>();
		for (const t of PIPELINE_TEMPLATES) {
			for (const b of Object.values(t.build().blocks)) allTypes.add(b.type);
		}
		// A representative spread of catalog types appears across the gallery.
		for (const type of [
			"model",
			"condition",
			"switch",
			"http_request",
			"db_write",
			"knowledge_retrieval",
			"tool_call",
			"notify",
		]) {
			expect(allTypes.has(type)).toBe(true);
		}
	});

	test("branch templates wire named source handles", () => {
		const branch = PIPELINE_TEMPLATES.find((t) => t.id === "condition-branch");
		if (!branch) throw new Error("condition-branch template missing");
		const handles = branch.build().edges.map((e) => e.sourceHandle);
		expect(handles).toContain("true");
		expect(handles).toContain("false");
	});

	test("role templates stay intact (built-in role parity)", () => {
		expect(ROLE_TEMPLATES.map((r) => r.slug)).toEqual([
			"prompt-improver",
			"decomposer",
			"orchestrator",
			"critic",
		]);
		for (const r of ROLE_TEMPLATES) {
			expect(r.preset.agentKind).toBe("chat");
		}
	});
});
