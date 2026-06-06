import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import {
	DEFAULT_MAX_NESTED_DEPTH,
	validateNestedWorkflowDepth,
} from "./validateNestedWorkflowDepth";

describe("validateNestedWorkflowDepth", () => {
	test("CORE-09: chain deeper than max depth is rejected", () => {
		// Linear chain s0 -> s1 -> ... -> s11 (depth 11), max depth 5.
		const chain = (id: string): string[] => {
			const n = Number(id.slice(1));
			return n < 11 ? [`s${n + 1}`] : [];
		};
		const issues = validateNestedWorkflowDepth("s0", chain, 5);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.code).toBe(
			WorkflowErrorCode.NESTED_WORKFLOW_DEPTH_EXCEEDED,
		);
	});

	test("chain within max depth is accepted", () => {
		const chain = (id: string): string[] => {
			const n = Number(id.slice(1));
			return n < 3 ? [`s${n + 1}`] : [];
		};
		expect(validateNestedWorkflowDepth("s0", chain, 5)).toHaveLength(0);
	});

	test("default max depth is 5", () => {
		expect(DEFAULT_MAX_NESTED_DEPTH).toBe(5);
	});

	test("dependency cycle does not infinitely recurse", () => {
		const cyclic = (id: string): string[] => (id === "a" ? ["b"] : ["a"]);
		// Should terminate (and report depth exceeded), not hang.
		const issues = validateNestedWorkflowDepth("a", cyclic, 5);
		expect(issues.length).toBeLessThanOrEqual(1);
	});
});
