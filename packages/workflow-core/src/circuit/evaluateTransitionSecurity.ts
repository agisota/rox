/**
 * Pure security predicate for execution-circuit transitions. Before the run
 * service executes a transition it must decide whether the transition is *safe
 * to run*: a manual step is always allowed, but an agent/tool/skill binding that
 * can take real-world actions must declare a checkable output contract and use a
 * permitted runtime kind/ref. This module is the deterministic gate that answers
 * that question without performing any side effects.
 *
 * It is the "security predicate" half of the execution circuit, complementing
 * the structural {@link ./validateExecutionCircuitSpec} (which checks shape) and
 * the {@link ./planExecutionPath} planner (which checks reachability). Decisions
 * are deterministic functions of `(transition, policy)` only.
 */

import type {
	ExecutionCircuitSpec,
	RuntimeBindingSpec,
	TransitionSpec,
} from "./types";

/** Stable codes for transition security decisions (append-only). */
export const TransitionSecurityCode = {
	RUNTIME_BINDING_MISSING: "RUNTIME_BINDING_MISSING",
	RUNTIME_KIND_NOT_ALLOWED: "RUNTIME_KIND_NOT_ALLOWED",
	RUNTIME_REF_NOT_ALLOWED: "RUNTIME_REF_NOT_ALLOWED",
	OUTPUT_CONTRACT_REQUIRED: "OUTPUT_CONTRACT_REQUIRED",
	VALIDATORS_REQUIRED: "VALIDATORS_REQUIRED",
} as const;

export type TransitionSecurityCode =
	(typeof TransitionSecurityCode)[keyof typeof TransitionSecurityCode];

/**
 * Policy controlling which transitions may execute. All fields are optional;
 * omitted fields fall back to {@link DEFAULT_TRANSITION_SECURITY_POLICY}.
 */
export interface TransitionSecurityPolicy {
	/** Runtime binding kinds permitted to execute. */
	allowedRuntimeKinds: string[];
	/** Kinds that MUST declare an output contract (so output is checkable). */
	kindsRequiringOutputContract: string[];
	/** Kinds that MUST declare at least one validator. */
	kindsRequiringValidators: string[];
	/**
	 * Allowlist of permitted runtime `ref`s. When omitted, refs are unrestricted;
	 * when present, a binding's `ref` must be listed (a missing ref is rejected).
	 */
	allowedRuntimeRefs?: string[];
}

/**
 * Conservative defaults: the four known binding kinds may run, and any binding
 * that is not a human `manual` step must declare an output contract so its
 * result can be checked. Validators are encouraged but not required by default.
 */
export const DEFAULT_TRANSITION_SECURITY_POLICY: TransitionSecurityPolicy = {
	allowedRuntimeKinds: ["manual", "agent", "skill", "tool"],
	kindsRequiringOutputContract: ["agent", "skill", "tool"],
	kindsRequiringValidators: [],
};

/** A single reason a transition was denied or flagged. */
export interface TransitionSecurityViolation {
	code: TransitionSecurityCode;
	message: string;
	/** `deny` blocks execution; `warn` is advisory only. */
	severity: "deny" | "warn";
}

/** The security decision for one transition. */
export interface TransitionSecurityDecision {
	transitionId: string;
	/** True when there are no `deny`-severity violations. */
	allowed: boolean;
	violations: TransitionSecurityViolation[];
}

/** The aggregate security decision for an entire circuit. */
export interface CircuitSecurityDecision {
	/** True when every transition is allowed. */
	allowed: boolean;
	decisions: TransitionSecurityDecision[];
}

function resolvePolicy(
	policy?: Partial<TransitionSecurityPolicy>,
): TransitionSecurityPolicy {
	if (!policy) return DEFAULT_TRANSITION_SECURITY_POLICY;
	return {
		allowedRuntimeKinds:
			policy.allowedRuntimeKinds ??
			DEFAULT_TRANSITION_SECURITY_POLICY.allowedRuntimeKinds,
		kindsRequiringOutputContract:
			policy.kindsRequiringOutputContract ??
			DEFAULT_TRANSITION_SECURITY_POLICY.kindsRequiringOutputContract,
		kindsRequiringValidators:
			policy.kindsRequiringValidators ??
			DEFAULT_TRANSITION_SECURITY_POLICY.kindsRequiringValidators,
		allowedRuntimeRefs: policy.allowedRuntimeRefs,
	};
}

function evaluateBinding(
	transition: TransitionSpec,
	binding: RuntimeBindingSpec,
	policy: TransitionSecurityPolicy,
	violations: TransitionSecurityViolation[],
): void {
	if (!policy.allowedRuntimeKinds.includes(binding.kind)) {
		violations.push({
			code: TransitionSecurityCode.RUNTIME_KIND_NOT_ALLOWED,
			message: `Transition "${transition.id}" uses runtime kind "${binding.kind}", which is not permitted to execute`,
			severity: "deny",
		});
	}

	if (policy.allowedRuntimeRefs) {
		if (!binding.ref || !policy.allowedRuntimeRefs.includes(binding.ref)) {
			violations.push({
				code: TransitionSecurityCode.RUNTIME_REF_NOT_ALLOWED,
				message: binding.ref
					? `Transition "${transition.id}" references runtime "${binding.ref}", which is not on the allowlist`
					: `Transition "${transition.id}" must reference an allowlisted runtime`,
				severity: "deny",
			});
		}
	}

	if (
		policy.kindsRequiringOutputContract.includes(binding.kind) &&
		!transition.monad.outputContract
	) {
		violations.push({
			code: TransitionSecurityCode.OUTPUT_CONTRACT_REQUIRED,
			message: `Transition "${transition.id}" (${binding.kind}) must declare an output contract before it can execute`,
			severity: "deny",
		});
	}

	if (
		policy.kindsRequiringValidators.includes(binding.kind) &&
		(transition.monad.validators?.length ?? 0) === 0
	) {
		violations.push({
			code: TransitionSecurityCode.VALIDATORS_REQUIRED,
			message: `Transition "${transition.id}" (${binding.kind}) must declare at least one validator before it can execute`,
			severity: "deny",
		});
	}
}

/**
 * Evaluate whether a single transition is permitted to execute under `policy`
 * (defaults to {@link DEFAULT_TRANSITION_SECURITY_POLICY}). Pure + deterministic.
 */
export function evaluateTransitionSecurity(
	transition: TransitionSpec,
	policy?: Partial<TransitionSecurityPolicy>,
): TransitionSecurityDecision {
	const resolved = resolvePolicy(policy);
	const violations: TransitionSecurityViolation[] = [];

	const binding = transition.monad.runtimeBinding;
	if (!binding) {
		violations.push({
			code: TransitionSecurityCode.RUNTIME_BINDING_MISSING,
			message: `Transition "${transition.id}" has no runtime binding and cannot be executed`,
			severity: "deny",
		});
	} else {
		evaluateBinding(transition, binding, resolved, violations);
	}

	const allowed = !violations.some((v) => v.severity === "deny");
	return { transitionId: transition.id, allowed, violations };
}

/**
 * Evaluate every transition in a circuit. The circuit is allowed only when all
 * of its transitions are allowed. Pure + deterministic.
 */
export function evaluateCircuitSecurity(
	circuit: ExecutionCircuitSpec,
	policy?: Partial<TransitionSecurityPolicy>,
): CircuitSecurityDecision {
	const decisions = circuit.transitions.map((transition) =>
		evaluateTransitionSecurity(transition, policy),
	);
	return {
		allowed: decisions.every((decision) => decision.allowed),
		decisions,
	};
}
