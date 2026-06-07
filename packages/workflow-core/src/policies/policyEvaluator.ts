import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import type { RoxBlockState, RoxWorkflowState } from "../types";
import type { PolicyDecision, WorkflowPolicy } from "./policyTypes";

/** Block types treated as external writes (need approval under POLICY-02). */
export const EXTERNAL_WRITE_BLOCK_TYPES = new Set<string>([
	"slack_send",
	"github_create_issue",
	"github_open_pr",
	"github_comment",
	"linear_create_issue",
	"http_request",
	"email_send",
	"webhook",
]);

function looksLikeExternalWrite(type: string): boolean {
	if (EXTERNAL_WRITE_BLOCK_TYPES.has(type)) return true;
	return /(^|_)(send|post|create|write|publish|open_pr)(_|$)/.test(type);
}

function blockModel(block: RoxBlockState): string | undefined {
	const m = block.subBlocks?.model;
	return typeof m === "string" ? m : undefined;
}

/**
 * Static policy evaluation over a workflow graph (publish-time). Returns a list
 * of decisions: `deny` for model-allowlist / denied-type violations (POLICY-01),
 * and `require_approval` for external-write blocks when the policy demands it
 * (POLICY-02).
 */
export function evaluateGraphPolicy(
	state: RoxWorkflowState,
	policy: WorkflowPolicy,
): PolicyDecision[] {
	const decisions: PolicyDecision[] = [];
	for (const [blockId, block] of Object.entries(state.blocks)) {
		if (block.enabled === false) continue;

		if (policy.deniedBlockTypes?.includes(block.type)) {
			decisions.push({
				effect: "deny",
				code: WorkflowErrorCode.POLICY_VIOLATION,
				blockId,
				message: `Block type "${block.type}" is denied by policy.`,
			});
		}

		if (policy.allowedModels && policy.allowedModels.length > 0) {
			const model = blockModel(block);
			if (model && !policy.allowedModels.includes(model)) {
				decisions.push({
					effect: "deny",
					code: WorkflowErrorCode.POLICY_VIOLATION,
					blockId,
					message: `Model "${model}" is not in the allowed list.`,
				});
			}
		}

		if (
			policy.externalWriteRequiresApproval &&
			looksLikeExternalWrite(block.type)
		) {
			decisions.push({
				effect: "require_approval",
				code: "EXTERNAL_WRITE_REQUIRES_APPROVAL",
				blockId,
				message: `External-write block "${block.type}" requires approval.`,
			});
		}
	}
	return decisions;
}

/** True when any decision denies the action (blocks publish/run). */
export function hasDenial(decisions: PolicyDecision[]): boolean {
	return decisions.some((d) => d.effect === "deny");
}

/** Convert policy denials into validation issues for the editor. */
export function policyDenialsToIssues(
	decisions: PolicyDecision[],
): WorkflowIssue[] {
	return decisions
		.filter((d) => d.effect === "deny")
		.map((d) => ({
			code: WorkflowErrorCode.POLICY_VIOLATION,
			severity: "error" as const,
			blockId: d.blockId,
			message: d.message,
		}));
}

/**
 * Dynamic cost-policy check (POLICY-05). Returns a decision when the estimated
 * run cost exceeds the ceiling, else `null`.
 */
export function evaluateCostPolicy(
	estimatedUsd: number,
	policy: WorkflowPolicy,
): PolicyDecision | null {
	if (policy.maxCostPerRunUsd == null) return null;
	if (estimatedUsd <= policy.maxCostPerRunUsd) return null;
	return {
		effect: policy.costExceededEffect ?? "require_approval",
		code: "COST_LIMIT_EXCEEDED",
		message: `Estimated cost $${estimatedUsd.toFixed(2)} exceeds the limit of $${policy.maxCostPerRunUsd.toFixed(2)}.`,
	};
}
