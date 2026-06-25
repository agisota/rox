import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { NodeCategory } from "./nodeCategory";
import type { NodeTypeDefinition } from "./nodeTypeDefinition";
import { NodeTypeRegistry } from "./nodeTypeRegistry";

function def(
	id: string,
	category: NodeCategory,
	overrides: Partial<NodeTypeDefinition> = {},
): NodeTypeDefinition {
	return {
		id,
		category,
		label: id,
		render: { icon: "Box", iconClass: "text-primary", miniMapColor: "#000" },
		inputs: [],
		outputs: [],
		configSchema: z.object({}).passthrough(),
		fields: [],
		...overrides,
	};
}

describe("NodeTypeRegistry", () => {
	test("registers and gets a definition", () => {
		const r = new NodeTypeRegistry();
		const d = def("foo", NodeCategory.AI);
		r.register(d);
		expect(r.get("foo")).toBe(d);
		expect(r.has("foo")).toBe(true);
		expect(r.has("missing")).toBe(false);
		expect(r.get("missing")).toBeUndefined();
	});

	test("seeds from the constructor", () => {
		const r = new NodeTypeRegistry([
			def("a", NodeCategory.Input),
			def("b", NodeCategory.Logic),
		]);
		expect(r.list().map((d) => d.id)).toEqual(["a", "b"]);
	});

	test("register replaces an existing id", () => {
		const r = new NodeTypeRegistry([def("a", NodeCategory.Input)]);
		const next = def("a", NodeCategory.Logic, { label: "renamed" });
		r.register(next);
		expect(r.list()).toHaveLength(1);
		expect(r.get("a")?.label).toBe("renamed");
	});

	test("listByCategory filters by category", () => {
		const r = new NodeTypeRegistry([
			def("a", NodeCategory.AI),
			def("b", NodeCategory.AI),
			def("c", NodeCategory.Logic),
		]);
		expect(r.listByCategory(NodeCategory.AI).map((d) => d.id)).toEqual([
			"a",
			"b",
		]);
		expect(r.listByCategory(NodeCategory.Logic).map((d) => d.id)).toEqual([
			"c",
		]);
		expect(r.listByCategory(NodeCategory.Data)).toEqual([]);
	});

	test("listGroupedByCategory omits empty categories and respects order", () => {
		const r = new NodeTypeRegistry([
			def("resp", NodeCategory.Output),
			def("start", NodeCategory.Input),
			def("cond", NodeCategory.Logic),
		]);
		const groups = r.listGroupedByCategory();
		expect(groups.map((g) => g.category)).toEqual([
			NodeCategory.Input,
			NodeCategory.Logic,
			NodeCategory.Output,
		]);
		expect(groups[0]?.nodes.map((d) => d.id)).toEqual(["start"]);
	});
});
