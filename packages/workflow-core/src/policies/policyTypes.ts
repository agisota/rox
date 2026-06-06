/** Effect of a policy rule on an action. */
export type PolicyEffect = "allow" | "deny" | "require_approval" | "redact";

/**
 * Declarative governance policy attached to a skill version or organization.
 * Evaluated statically at publish time and dynamically before a run.
 */
export interface WorkflowPolicy {
	/** When set, only these model ids may be used by agent/LLM blocks (POLICY-01). */
	allowedModels?: string[];
	/** Block types that are outright forbidden. */
	deniedBlockTypes?: string[];
	/** External-write blocks require a human approval before executing (POLICY-02). */
	externalWriteRequiresApproval?: boolean;
	/** Hard ceiling on estimated cost per run, in USD (POLICY-05). */
	maxCostPerRunUsd?: number;
	/** What to do when the cost ceiling is exceeded. Default: require_approval. */
	costExceededEffect?: Extract<PolicyEffect, "deny" | "require_approval">;
}

export interface PolicyDecision {
	effect: PolicyEffect;
	code: string;
	message: string;
	blockId?: string;
}
