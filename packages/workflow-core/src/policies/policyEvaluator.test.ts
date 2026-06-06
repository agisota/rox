import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import type { SupersetWorkflowState } from "../types";
import {
	evaluateCostPolicy,
	evaluateGraphPolicy,
	hasDenial,
	policyDenialsToIssues,
} from "./policyEvaluator";

function state(blocks: SupersetWorkflowState["blocks"]): SupersetWorkflowState {
	return {
		blocks,
		edges: [],
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "p" },
	};
}

describe("evaluateGraphPolicy", () => {
	test("POLICY-01: model not in allowlist is denied", () => {
		const s = state({
			start: { type: "start" },
			agent: { type: "agent", subBlocks: { model: "gpt-4o" } },
		});
		const decisions = evaluateGraphPolicy(s, {
			allowedModels: ["claude-opus-4-8"],
		});
		expect(hasDenial(decisions)).toBe(true);
		expect(policyDenialsToIssues(decisions)[0]?.code).toBe(
			WorkflowErrorCode.POLICY_VIOLATION,
		);
	});

	test("POLICY-01: allowed model passes", () => {
		const s = state({
			agent: { type: "agent", subBlocks: { model: "claude-opus-4-8" } },
		});
		expect(
			hasDenial(evaluateGraphPolicy(s, { allowedModels: ["claude-opus-4-8"] })),
		).toBe(false);
	});

	test("denied block type is denied", () => {
		const s = state({ x: { type: "http_request" } });
		expect(
			hasDenial(evaluateGraphPolicy(s, { deniedBlockTypes: ["http_request"] })),
		).toBe(true);
	});

	test("POLICY-02: external-write block requires approval", () => {
		const s = state({
			start: { type: "start" },
			slack: { type: "slack_send" },
		});
		const decisions = evaluateGraphPolicy(s, {
			externalWriteRequiresApproval: true,
		});
		expect(decisions.some((d) => d.effect === "require_approval")).toBe(true);
		expect(hasDenial(decisions)).toBe(false);
	});

	test("disabled blocks are ignored", () => {
		const s = state({
			agent: {
				type: "agent",
				enabled: false,
				subBlocks: { model: "gpt-4o" },
			},
		});
		expect(
			evaluateGraphPolicy(s, { allowedModels: ["claude-opus-4-8"] }),
		).toHaveLength(0);
	});
});

describe("evaluateCostPolicy (POLICY-05)", () => {
	test("over the limit requires approval by default", () => {
		const d = evaluateCostPolicy(0.9, { maxCostPerRunUsd: 0.25 });
		expect(d?.effect).toBe("require_approval");
		expect(d?.code).toBe("COST_LIMIT_EXCEEDED");
	});
	test("over the limit can deny when configured", () => {
		const d = evaluateCostPolicy(0.9, {
			maxCostPerRunUsd: 0.25,
			costExceededEffect: "deny",
		});
		expect(d?.effect).toBe("deny");
	});
	test("within the limit is allowed (null)", () => {
		expect(evaluateCostPolicy(0.1, { maxCostPerRunUsd: 0.25 })).toBeNull();
	});
	test("no limit set is allowed (null)", () => {
		expect(evaluateCostPolicy(99, {})).toBeNull();
	});
});
