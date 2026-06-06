import { validateValueAgainstSchema } from "../schema/jsonSchema";
import type { JsonSchema } from "../types";

export interface EvaluationCaseInput {
	/** Expected output; matched as a deep subset of the actual output. */
	expectedOutput?: Record<string, unknown>;
	/** When set, the actual output must also satisfy this schema. */
	outputSchema?: JsonSchema;
}

export interface EvaluationCaseResult {
	passed: boolean;
	failures: { path: string; message: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-equality for JSON-ish values. */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	}
	if (isRecord(a) && isRecord(b)) {
		const ak = Object.keys(a);
		return (
			ak.length === Object.keys(b).length &&
			ak.every((k) => deepEqual(a[k], b[k]))
		);
	}
	return false;
}

/** Collect subset-match failures: every key in `expected` must deep-equal actual. */
function subsetFailures(
	expected: Record<string, unknown>,
	actual: unknown,
	path: string,
): { path: string; message: string }[] {
	if (!isRecord(actual)) {
		return [{ path, message: "expected an object" }];
	}
	const failures: { path: string; message: string }[] = [];
	for (const [key, expectedValue] of Object.entries(expected)) {
		const here = `${path}.${key}`;
		if (!(key in actual)) {
			failures.push({ path: here, message: `missing key "${key}"` });
			continue;
		}
		const actualValue = actual[key];
		if (isRecord(expectedValue)) {
			failures.push(...subsetFailures(expectedValue, actualValue, here));
		} else if (!deepEqual(expectedValue, actualValue)) {
			failures.push({ path: here, message: "value does not match expected" });
		}
	}
	return failures;
}

/**
 * Evaluate a single skill output against an eval case: it must satisfy the
 * output schema (EVAL-03) and deep-subset-match the expected golden output
 * (EVAL-02). Returns pass/fail plus the specific failures.
 */
export function evaluateCase(
	actualOutput: unknown,
	testCase: EvaluationCaseInput,
): EvaluationCaseResult {
	const failures: { path: string; message: string }[] = [];

	if (testCase.outputSchema) {
		for (const v of validateValueAgainstSchema(
			actualOutput,
			testCase.outputSchema,
		)) {
			failures.push({ path: v.path, message: v.message });
		}
	}
	if (testCase.expectedOutput) {
		failures.push(
			...subsetFailures(testCase.expectedOutput, actualOutput, "$"),
		);
	}

	return { passed: failures.length === 0, failures };
}

export interface RegressionInput {
	baselinePassRate: number;
	candidatePassRate: number;
	/** Max allowed drop in pass rate (e.g. 0.1 = 10%). */
	maxRegression: number;
}

/**
 * Compare a candidate skill version's eval pass-rate against the baseline
 * (EVAL-05). Regressed when the drop exceeds `maxRegression`.
 */
export function isRegression(input: RegressionInput): boolean {
	return input.baselinePassRate - input.candidatePassRate > input.maxRegression;
}

/** Aggregate pass rate over a set of case results. */
export function passRate(results: EvaluationCaseResult[]): number {
	if (results.length === 0) return 1;
	const passed = results.filter((r) => r.passed).length;
	return passed / results.length;
}
