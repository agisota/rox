import { describe, expect, test } from "bun:test";
import type { JsonSchema } from "../types";
import { evaluateCase, isRegression, passRate } from "./evaluateCase";

describe("evaluateCase", () => {
	test("EVAL-02: golden subset match passes", () => {
		const r = evaluateCase(
			{ task_ids: ["a", "b"], extra: 1 },
			{ expectedOutput: { task_ids: ["a", "b"] } },
		);
		expect(r.passed).toBe(true);
	});

	test("EVAL-02: golden mismatch fails", () => {
		const r = evaluateCase(
			{ task_ids: ["a"] },
			{ expectedOutput: { task_ids: ["a", "b"] } },
		);
		expect(r.passed).toBe(false);
		expect(r.failures[0]?.path).toBe("$.task_ids");
	});

	test("EVAL-03: schema validation failure fails", () => {
		const outputSchema: JsonSchema = {
			type: "object",
			required: ["task_ids"],
			properties: { task_ids: { type: "array" } },
		};
		const r = evaluateCase({ task_ids: "abc" }, { outputSchema });
		expect(r.passed).toBe(false);
		expect(r.failures.some((f) => f.path === "$.task_ids")).toBe(true);
	});

	test("missing required key reported", () => {
		const r = evaluateCase({}, { expectedOutput: { x: 1 } });
		expect(r.failures[0]?.message).toContain("missing");
	});
});

describe("regression comparison (EVAL-05)", () => {
	test("100% -> 70% with 10% threshold is a regression", () => {
		expect(
			isRegression({
				baselinePassRate: 1,
				candidatePassRate: 0.7,
				maxRegression: 0.1,
			}),
		).toBe(true);
	});
	test("100% -> 95% with 10% threshold is not a regression", () => {
		expect(
			isRegression({
				baselinePassRate: 1,
				candidatePassRate: 0.95,
				maxRegression: 0.1,
			}),
		).toBe(false);
	});
	test("passRate aggregates results", () => {
		expect(
			passRate([
				{ passed: true, failures: [] },
				{ passed: false, failures: [] },
			]),
		).toBe(0.5);
		expect(passRate([])).toBe(1);
	});
});
