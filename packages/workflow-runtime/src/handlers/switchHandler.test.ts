import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import { makeSwitchHandler, parseSwitchCases } from "./switchHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "s1",
		block: { type: "switch", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("parseSwitchCases", () => {
	test("keeps entries with a string id, drops the rest", () => {
		expect(
			parseSwitchCases([
				{ id: "a", value: 1 },
				{ value: 2 },
				{ id: "", value: 3 },
				"nope",
			]),
		).toEqual([{ id: "a", value: 1 }]);
	});
	test("accepts `match` as a value alias", () => {
		expect(parseSwitchCases([{ id: "x", match: "go" }])).toEqual([
			{ id: "x", value: "go" },
		]);
	});
	test("non-array input yields no cases", () => {
		expect(parseSwitchCases(undefined)).toEqual([]);
	});
});

describe("makeSwitchHandler", () => {
	const cases = [
		{ id: "free", value: "free" },
		{ id: "pro", value: "pro" },
	];

	test("matches a case by field selector", () => {
		const res = makeSwitchHandler()(
			ctx({ field: "plan", cases }, { plan: "pro" }),
		);
		expect(res.handle).toBe("pro");
		expect(res.output?.value).toBe("pro");
	});

	test("matches a case by expression selector", () => {
		const res = makeSwitchHandler()(
			ctx({ value: "user.plan", cases }, { user: { plan: "free" } }),
		);
		expect(res.handle).toBe("free");
	});

	test("no match fires the default handle", () => {
		const res = makeSwitchHandler()(
			ctx({ field: "plan", cases }, { plan: "enterprise" }),
		);
		expect(res.handle).toBe("default");
	});

	test("cross-type numeric/string match", () => {
		const res = makeSwitchHandler()(
			ctx({ field: "code", cases: [{ id: "ok", value: 200 }] }, { code: 200 }),
		);
		expect(res.handle).toBe("ok");
	});

	test("selector evaluation error routes to error handle", () => {
		const res = makeSwitchHandler()(ctx({ value: "bad >", cases }, {}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("SWITCH_EVAL_FAILED");
	});
});
