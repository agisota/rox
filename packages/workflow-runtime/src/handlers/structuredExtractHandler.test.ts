import { describe, expect, test } from "bun:test";
import { validateOutput } from "@rox/workflow-core";
import type { BlockHandlerContext } from "../executor/types";
import {
	makeStructuredExtractHandler,
	resolveSchema,
	type StructuredExtractPort,
} from "./structuredExtractHandler";

const SCHEMA = {
	type: "object",
	required: ["name", "age"],
	properties: {
		name: { type: "string" },
		age: { type: "integer" },
	},
};

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "s1",
		block: { type: "structured_extract", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("resolveSchema", () => {
	test("accepts a schema object", () => {
		expect(resolveSchema({ schema: SCHEMA })).toEqual(SCHEMA);
	});

	test("accepts a JSON string schema", () => {
		expect(resolveSchema({ schema: JSON.stringify(SCHEMA) })).toEqual(SCHEMA);
	});

	test("returns undefined for garbage", () => {
		expect(resolveSchema({ schema: "{not json" })).toBeUndefined();
		expect(resolveSchema({})).toBeUndefined();
	});
});

describe("makeStructuredExtractHandler", () => {
	test("validates against schema and returns data on out", async () => {
		const extract: StructuredExtractPort = async () => ({
			object: { name: "Ada", age: 36 },
		});
		const handler = makeStructuredExtractHandler(extract, validateOutput);
		const res = await handler(
			ctx({ schema: SCHEMA, prompt: "extract the person" }),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.data).toEqual({ name: "Ada", age: 36 });
		expect(res.error).toBeUndefined();
	});

	test("schema violation routes to error handle (not silent)", async () => {
		// `age` is a string, violating the integer schema.
		const extract: StructuredExtractPort = async () => ({
			object: { name: "Ada", age: "thirty-six" },
		});
		const handler = makeStructuredExtractHandler(extract, validateOutput);
		const res = await handler(ctx({ schema: SCHEMA, prompt: "extract" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("STRUCTURED_EXTRACT_SCHEMA_VALIDATION_FAILED");
		expect(res.output).toBeUndefined();
	});

	test("missing required field routes to error", async () => {
		const extract: StructuredExtractPort = async () => ({
			object: { name: "Ada" },
		});
		const handler = makeStructuredExtractHandler(extract, validateOutput);
		const res = await handler(ctx({ schema: SCHEMA, prompt: "extract" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("STRUCTURED_EXTRACT_SCHEMA_VALIDATION_FAILED");
	});

	test("forwards prompt + schema to the port", async () => {
		let seen: { prompt: string } | undefined;
		const handler = makeStructuredExtractHandler(async (req) => {
			seen = { prompt: req.prompt };
			return { object: { name: "X", age: 1 } };
		}, validateOutput);
		await handler(ctx({ schema: SCHEMA }, { text: "raw upstream text" }));
		expect(seen?.prompt).toBe("raw upstream text");
	});

	test("missing schema routes to error", async () => {
		const handler = makeStructuredExtractHandler(
			async () => ({ object: {} }),
			validateOutput,
		);
		const res = await handler(ctx({ prompt: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("STRUCTURED_EXTRACT_SCHEMA_MISSING");
	});

	test("missing prompt routes to error", async () => {
		const handler = makeStructuredExtractHandler(
			async () => ({ object: {} }),
			validateOutput,
		);
		const res = await handler(ctx({ schema: SCHEMA }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("STRUCTURED_EXTRACT_PROMPT_MISSING");
	});

	test("provider error routes to error", async () => {
		const handler = makeStructuredExtractHandler(async () => {
			throw new Error("llm down");
		}, validateOutput);
		const res = await handler(ctx({ schema: SCHEMA, prompt: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("STRUCTURED_EXTRACT_CALL_FAILED");
		expect(res.error?.message).toContain("llm down");
	});
});
