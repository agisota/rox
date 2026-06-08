import {
	type CircuitValidationError,
	type CircuitValidationResult,
	type ExecutionCircuitSpec,
	FULLY_SPECIFIED_STATUSES,
	type StateSpec,
} from "./types";

/**
 * Validate an Execution Circuit spec. Returns structured errors (not strings)
 * so the UI can map them to fields. Catches structural problems: missing
 * states, dangling transition references, duplicate ids, and — once a circuit
 * claims to be `ready`/`running`/`completed` — missing transitions, events,
 * validators, and output-contract fields.
 */
export function validateExecutionCircuitSpec(
	spec: ExecutionCircuitSpec,
): CircuitValidationResult {
	const errors: CircuitValidationError[] = [];
	const err = (path: string, code: string, message: string) =>
		errors.push({ path, code, message });

	if (!spec.currentState) {
		err("currentState", "MISSING_CURRENT_STATE", "Current state is required.");
	}
	if (!spec.targetState) {
		err("targetState", "MISSING_TARGET_STATE", "Target state is required.");
	}

	// Collect all known state ids and flag duplicates.
	const states: StateSpec[] = [
		spec.currentState,
		spec.targetState,
		...(spec.intermediateStates ?? []),
	].filter(Boolean);
	const stateIds = new Set<string>();
	const knownStateIds = new Set<string>();
	for (const state of states) {
		if (stateIds.has(state.id)) {
			err(
				`states.${state.id}`,
				"DUPLICATE_STATE_ID",
				`Duplicate state id "${state.id}".`,
			);
		}
		stateIds.add(state.id);
		knownStateIds.add(state.id);
	}

	const mustBeComplete = FULLY_SPECIFIED_STATUSES.has(spec.status);

	const transitions = spec.transitions ?? [];
	if (mustBeComplete && transitions.length === 0) {
		err(
			"transitions",
			"NO_TRANSITIONS",
			`A "${spec.status}" circuit must have at least one transition.`,
		);
	}

	const transitionIds = new Set<string>();
	transitions.forEach((transition, index) => {
		const base = `transitions[${index}]`;
		if (transitionIds.has(transition.id)) {
			err(
				`${base}.id`,
				"DUPLICATE_TRANSITION_ID",
				`Duplicate transition id "${transition.id}".`,
			);
		}
		transitionIds.add(transition.id);

		if (!knownStateIds.has(transition.fromStateId)) {
			err(
				`${base}.fromStateId`,
				"UNKNOWN_FROM_STATE",
				`Transition "${transition.id}" references unknown fromStateId "${transition.fromStateId}".`,
			);
		}
		if (!knownStateIds.has(transition.toStateId)) {
			err(
				`${base}.toStateId`,
				"UNKNOWN_TO_STATE",
				`Transition "${transition.id}" references unknown toStateId "${transition.toStateId}".`,
			);
		}

		if (mustBeComplete) {
			if ((transition.requiredEvents ?? []).length === 0) {
				err(
					`${base}.requiredEvents`,
					"NO_REQUIRED_EVENTS",
					`Transition "${transition.id}" must declare at least one required event.`,
				);
			}
			if ((transition.validators ?? []).length === 0) {
				err(
					`${base}.validators`,
					"NO_VALIDATORS",
					`Transition "${transition.id}" must declare at least one validator.`,
				);
			}
			if ((transition.outputContract?.requiredFields ?? []).length === 0) {
				err(
					`${base}.outputContract.requiredFields`,
					"EMPTY_OUTPUT_CONTRACT",
					`Transition "${transition.id}" output contract must list required fields.`,
				);
			}
		}
	});

	return { ok: errors.length === 0, errors };
}
