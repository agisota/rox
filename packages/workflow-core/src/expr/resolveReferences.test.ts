import { describe, expect, it } from "bun:test";
import {
	hasReference,
	ReferenceResolutionError,
	type ResolvableNode,
	resolveRecordReferences,
	resolveReferences,
	resolveTemplate,
} from "./resolveReferences";

const nodes: ResolvableNode[] = [
	{ id: "a", name: "Retrieval", output: { text: "hello", n: 3 } },
	{
		id: "model_1",
		name: "Model 1",
		output: { chunks: ["x", "y"], meta: { score: 0.9 } },
	},
];

describe("resolveTemplate", () => {
	it("expands {{a.text}} from an upstream node output", () => {
		expect(resolveTemplate("{{a.text}}", nodes)).toBe("hello");
	});

	it("interpolates mixed text with JSON for non-strings", () => {
		expect(resolveTemplate("count=({{a.n}})", nodes)).toBe("count=(3)");
	});

	it("preserves value type for a whole-string placeholder", () => {
		expect(resolveTemplate("{{model_1.chunks}}", nodes)).toEqual(["x", "y"]);
	});

	it("resolves by case-insensitive node name with spaces", () => {
		expect(resolveTemplate("{{Model 1.meta.score}}", nodes)).toBe(0.9);
	});

	it("leaves a non-node placeholder intact (single-scope passthrough)", () => {
		// `missing` names no known node → not a cross-node ref; left verbatim for
		// the immediate-input resolver. Unreachable nodes thus stay unresolved.
		expect(resolveTemplate("{{missing.text}}", nodes)).toBe("{{missing.text}}");
		expect(resolveTemplate("pre {{plain}} post", nodes)).toBe(
			"pre {{plain}} post",
		);
	});

	it("throws on a missing path within a known node", () => {
		try {
			resolveTemplate("{{a.nope}}", nodes);
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ReferenceResolutionError);
			expect((err as ReferenceResolutionError).reason).toBe("unknown-path");
		}
	});
});

describe("resolveReferences (deep)", () => {
	it("walks nested records and arrays", () => {
		const out = resolveReferences(
			{ prompt: "say {{a.text}}", list: ["{{a.n}}", "raw"] },
			nodes,
		);
		// Whole-string `{{a.n}}` preserves the number type; interpolated text stays a string.
		expect(out).toEqual({ prompt: "say hello", list: [3, "raw"] });
	});

	it("leaves non-reference values untouched", () => {
		expect(resolveReferences({ k: 5, s: "plain" }, nodes)).toEqual({
			k: 5,
			s: "plain",
		});
	});
});

describe("resolveRecordReferences", () => {
	it("returns a record with references expanded", () => {
		expect(
			resolveRecordReferences({ userPrompt: "{{a.text}} world" }, nodes),
		).toEqual({ userPrompt: "hello world" });
	});
});

describe("hasReference", () => {
	it("detects placeholders", () => {
		expect(hasReference("a {{x.y}} b")).toBe(true);
		expect(hasReference("plain")).toBe(false);
	});
});
