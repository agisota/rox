import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	coerceField,
	makeManualInputHandler,
	parseManualInputFields,
} from "./manualInputHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	runInput: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "m1",
		block: { type: "manual_input", subBlocks },
		// manual_input is an entry node: its merged `input` IS the run input.
		input: runInput,
		runInput,
		resolveSecret: () => undefined,
	};
}

describe("parseManualInputFields", () => {
	test("keeps recognized types, drops unknown ones", () => {
		expect(
			parseManualInputFields({
				name: "string",
				age: "number",
				flag: "boolean",
				blob: "json",
				bad: "date",
			}),
		).toEqual({ name: "string", age: "number", flag: "boolean", blob: "json" });
	});
	test("returns empty for non-object input", () => {
		expect(parseManualInputFields(null)).toEqual({});
		expect(parseManualInputFields("x")).toEqual({});
	});
});

describe("coerceField", () => {
	test("number from string and number", () => {
		expect(coerceField("42", "number")).toBe(42);
		expect(coerceField(7, "number")).toBe(7);
		expect(coerceField("nope", "number")).toBeUndefined();
	});
	test("boolean from string and boolean", () => {
		expect(coerceField("true", "boolean")).toBe(true);
		expect(coerceField("FALSE", "boolean")).toBe(false);
		expect(coerceField(true, "boolean")).toBe(true);
		expect(coerceField("maybe", "boolean")).toBeUndefined();
	});
	test("json parses strings, passes through objects", () => {
		expect(coerceField('{"a":1}', "json")).toEqual({ a: 1 });
		expect(coerceField({ a: 1 }, "json")).toEqual({ a: 1 });
		expect(coerceField("{bad", "json")).toBeUndefined();
	});
	test("string passes strings through, JSON-encodes non-strings", () => {
		expect(coerceField("hi", "string")).toBe("hi");
		expect(coerceField({ a: 1 }, "string")).toBe('{"a":1}');
	});
});

describe("makeManualInputHandler", () => {
	test("forwards the whole run input when no fields are declared", () => {
		const handler = makeManualInputHandler();
		const res = handler(ctx({}, { a: 1, b: "x" }));
		expect(res).toEqual({ handle: "out", output: { a: 1, b: "x" } });
	});

	test("shapes the run input by declared typed fields", async () => {
		const handler = makeManualInputHandler();
		const res = await handler(
			ctx(
				{ fields: { age: "number", active: "boolean", name: "string" } },
				{ age: "30", active: "true", name: "Mark", extra: "ignored" },
			),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ age: 30, active: true, name: "Mark" });
	});

	test("omits fields absent or uncoercible from the run input", async () => {
		const handler = makeManualInputHandler();
		const res = await handler(
			ctx({ fields: { age: "number", missing: "string" } }, { age: "bad" }),
		);
		expect(res.output).toEqual({});
	});
});
