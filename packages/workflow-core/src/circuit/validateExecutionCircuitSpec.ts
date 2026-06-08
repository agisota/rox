/**
 * Pure structural validation of an {@link ExecutionCircuitSpec}. Issues are
 * accumulated (not thrown) so the editor can surface every problem at once,
 * mirroring the graph validator in `../graph/validateGraph.ts`.
 */

import type { ExecutionCircuitSpec } from "./types";

/** Stable error codes for execution-circuit validation (append-only). */
export const ExecutionCircuitErrorCode = {
	MISSING_INITIAL_STATE: "MISSING_INITIAL_STATE",
	MISSING_TARGET_STATE: "MISSING_TARGET_STATE",
	UNKNOWN_STATE_REF: "UNKNOWN_STATE_REF",
	DUPLICATE_STATE_ID: "DUPLICATE_STATE_ID",
	DUPLICATE_TRANSITION_ID: "DUPLICATE_TRANSITION_ID",
	DUPLICATE_VALIDATOR_ID: "DUPLICATE_VALIDATOR_ID",
	EMPTY_OUTPUT_CONTRACT: "EMPTY_OUTPUT_CONTRACT",
	NO_STATES: "NO_STATES",
} as const;

export type ExecutionCircuitErrorCode =
	(typeof ExecutionCircuitErrorCode)[keyof typeof ExecutionCircuitErrorCode];

/** A single validation problem found in an execution circuit spec. */
export interface ExecutionCircuitIssue {
	code: ExecutionCircuitErrorCode;
	message: string;
	/** State id the issue is anchored to, when applicable. */
	stateId?: string;
	/** Transition id the issue is anchored to, when applicable. */
	transitionId?: string;
	severity: "error" | "warning";
}

/** Result of validating an execution circuit spec without executing it. */
export interface ExecutionCircuitValidationResult {
	valid: boolean;
	issues: ExecutionCircuitIssue[];
}

function isEmptySchema(schema: Record<string, unknown> | undefined): boolean {
	if (!schema) return true;
	return !schema.type && !schema.properties && !schema.enum && !schema.items;
}

/**
 * Validate the structure of an execution circuit: state id uniqueness, known
 * initial/target/transition state refs, transition id uniqueness, validator id
 * uniqueness within a monad, and non-empty output contracts.
 */
export function validateExecutionCircuitSpec(
	spec: ExecutionCircuitSpec,
): ExecutionCircuitValidationResult {
	const issues: ExecutionCircuitIssue[] = [];

	if (spec.states.length === 0) {
		issues.push({
			code: ExecutionCircuitErrorCode.NO_STATES,
			message: "Circuit has no states",
			severity: "error",
		});
	}

	const stateIds = new Set<string>();
	for (const state of spec.states) {
		if (stateIds.has(state.id)) {
			issues.push({
				code: ExecutionCircuitErrorCode.DUPLICATE_STATE_ID,
				message: `Duplicate state id "${state.id}"`,
				stateId: state.id,
				severity: "error",
			});
		}
		stateIds.add(state.id);
	}

	if (!stateIds.has(spec.initialState)) {
		issues.push({
			code: ExecutionCircuitErrorCode.MISSING_INITIAL_STATE,
			message: `Initial state "${spec.initialState}" is not a declared state`,
			stateId: spec.initialState,
			severity: "error",
		});
	}

	if (!spec.targetState || !stateIds.has(spec.targetState)) {
		issues.push({
			code: ExecutionCircuitErrorCode.MISSING_TARGET_STATE,
			message: spec.targetState
				? `Target state "${spec.targetState}" is not a declared state`
				: "Circuit is missing a TargetState",
			stateId: spec.targetState || undefined,
			severity: "error",
		});
	}

	const transitionIds = new Set<string>();
	for (const transition of spec.transitions) {
		if (transitionIds.has(transition.id)) {
			issues.push({
				code: ExecutionCircuitErrorCode.DUPLICATE_TRANSITION_ID,
				message: `Duplicate transition id "${transition.id}"`,
				transitionId: transition.id,
				severity: "error",
			});
		}
		transitionIds.add(transition.id);

		if (!stateIds.has(transition.from)) {
			issues.push({
				code: ExecutionCircuitErrorCode.UNKNOWN_STATE_REF,
				message: `Transition "${transition.id}" references unknown source state "${transition.from}"`,
				transitionId: transition.id,
				stateId: transition.from,
				severity: "error",
			});
		}
		if (!stateIds.has(transition.to)) {
			issues.push({
				code: ExecutionCircuitErrorCode.UNKNOWN_STATE_REF,
				message: `Transition "${transition.id}" references unknown target state "${transition.to}"`,
				transitionId: transition.id,
				stateId: transition.to,
				severity: "error",
			});
		}

		const validatorIds = new Set<string>();
		for (const validator of transition.monad.validators ?? []) {
			if (validatorIds.has(validator.id)) {
				issues.push({
					code: ExecutionCircuitErrorCode.DUPLICATE_VALIDATOR_ID,
					message: `Duplicate validator id "${validator.id}" in transition "${transition.id}"`,
					transitionId: transition.id,
					severity: "error",
				});
			}
			validatorIds.add(validator.id);
		}

		const contract = transition.monad.outputContract;
		if (contract && isEmptySchema(contract.schema)) {
			issues.push({
				code: ExecutionCircuitErrorCode.EMPTY_OUTPUT_CONTRACT,
				message: `Transition "${transition.id}" declares an output contract with an empty schema`,
				transitionId: transition.id,
				severity: "warning",
			});
		}
	}

	const valid = !issues.some((issue) => issue.severity === "error");
	return { valid, issues };
}
