import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	makeParserHandler,
	makeTransformHandler,
	makeVariableSetHandler,
	parseCsv,
	renderTemplate,
} from "./dataHandlers";

function ctx(
	type: string,
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "d1",
		block: { type, subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("renderTemplate", () => {
	test("expands {{path}} placeholders and JSON-encodes non-strings", () => {
		expect(renderTemplate("Hi {{name}} ({{n}})", { name: "Ada", n: 7 })).toBe(
			"Hi Ada (7)",
		);
	});
	test("missing path collapses to empty string", () => {
		expect(renderTemplate("[{{missing}}]", {})).toBe("[]");
	});
});

describe("parseCsv", () => {
	test("parses header + rows into objects", () => {
		const rows = parseCsv("a,b\n1,2\n3,4");
		expect(rows).toEqual([
			{ a: "1", b: "2" },
			{ a: "3", b: "4" },
		]);
	});
	test("handles quoted fields with commas and escaped quotes", () => {
		const rows = parseCsv('name,note\n"Doe, John","say ""hi"""');
		expect(rows).toEqual([{ name: "Doe, John", note: 'say "hi"' }]);
	});
});

describe("makeTransformHandler", () => {
	test("mapping mode renames/picks/computes fields via safe expressions", async () => {
		const res = await makeTransformHandler()(
			ctx(
				"transform",
				{ mode: "mapping", mapping: { full: "first", doubled: "n * 2" } },
				{ first: "Ada", n: 21 },
			),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ full: "Ada", doubled: 42 });
	});

	test("template mode renders a string from the input", async () => {
		const res = await makeTransformHandler()(
			ctx(
				"transform",
				{ mode: "template", template: "Hello {{who}}" },
				{
					who: "world",
				},
			),
		);
		expect(res.output).toEqual({ text: "Hello world" });
	});

	test("a bad mapping expression routes to the error handle", async () => {
		const res = await makeTransformHandler()(
			ctx("transform", { mode: "mapping", mapping: { x: "1 +" } }, {}),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("TRANSFORM_EXPR_FAILED");
	});
});

describe("makeParserHandler", () => {
	test("parses JSON into { value }", async () => {
		const res = await makeParserHandler()(
			ctx("parser", { format: "json", input: '{"ok":true,"n":3}' }),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ value: { ok: true, n: 3 } });
	});

	test("parses CSV into { rows }", async () => {
		const res = await makeParserHandler()(
			ctx("parser", { format: "csv", input: "a,b\n1,2" }),
		);
		expect(res.output).toEqual({ rows: [{ a: "1", b: "2" }] });
	});

	test("regex extracts groups", async () => {
		const res = await makeParserHandler()(
			ctx("parser", {
				format: "regex",
				pattern: "(\\d+)-(\\d+)",
				input: "order 12-34",
			}),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.match).toBe("12-34");
		expect(res.output?.groups).toEqual(["12", "34"]);
	});

	test("garbage JSON routes to the error handle", async () => {
		const res = await makeParserHandler()(
			ctx("parser", { format: "json", input: "{not json" }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("PARSER_FAILED");
	});

	test("falls back to input.text when subBlocks.input is empty", async () => {
		const res = await makeParserHandler()(
			ctx("parser", { format: "json" }, { text: "[1,2,3]" }),
		);
		expect(res.output).toEqual({ value: [1, 2, 3] });
	});
});

describe("makeVariableSetHandler", () => {
	test("evaluates the value expression and merges it onto the input", async () => {
		const res = await makeVariableSetHandler()(
			ctx(
				"variable_set",
				{ key: "total", value: "price * qty" },
				{
					price: 10,
					qty: 3,
				},
			),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ price: 10, qty: 3, total: 30 });
	});

	test("falls back to the literal string for non-expression values", async () => {
		const res = await makeVariableSetHandler()(
			ctx("variable_set", { key: "label", value: "hello world" }, {}),
		);
		expect(res.output).toEqual({ label: "hello world" });
	});

	test("missing key routes to the error handle", async () => {
		const res = await makeVariableSetHandler()(
			ctx("variable_set", { value: "1" }, {}),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("VARIABLE_KEY_MISSING");
	});
});
