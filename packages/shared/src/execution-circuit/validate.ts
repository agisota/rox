import {
	type CircuitValidationError,
	type CircuitValidationResult,
	type ExecutionCircuitSpec,
	executionCircuitSpecSchema,
} from "./schemas";

const statusesThatRequireExecutableSpec = new Set([
	"ready",
	"running",
	"completed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addError(
	errors: CircuitValidationError[],
	path: string,
	code: string,
	message: string,
) {
	errors.push({ path, code, message });
}

export function validateExecutionCircuitSpec(
	spec: unknown,
): CircuitValidationResult {
	const errors: CircuitValidationError[] = [];

	if (!isRecord(spec)) {
		addError(
			errors,
			"",
			"invalid_spec",
			"Execution circuit spec must be an object.",
		);
		return { ok: false, errors };
	}

	if (!isRecord(spec.currentState)) {
		addError(
			errors,
			"currentState",
			"missing_current_state",
			"Current state is required.",
		);
	}

	if (!isRecord(spec.targetState)) {
		addError(
			errors,
			"targetState",
			"missing_target_state",
			"Target state is required.",
		);
	}

	const parsed = executionCircuitSpecSchema.safeParse(spec);

	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const path = issue.path.join(".");
			if (
				(path === "currentState" && issue.code === "invalid_type") ||
				(path === "targetState" && issue.code === "invalid_type")
			) {
				continue;
			}
			addError(errors, path, "invalid_spec", issue.message);
		}

		return { ok: errors.length === 0, errors };
	}

	collectSemanticErrors(parsed.data, errors);

	return { ok: errors.length === 0, errors };
}

function collectSemanticErrors(
	spec: ExecutionCircuitSpec,
	errors: CircuitValidationError[],
) {
	const states = [
		spec.currentState,
		...spec.intermediateStates,
		spec.targetState,
	];
	const seenStateIds = new Set<string>();
	const duplicateStateIds = new Set<string>();

	for (const state of states) {
		if (seenStateIds.has(state.id)) {
			duplicateStateIds.add(state.id);
		}
		seenStateIds.add(state.id);
	}

	for (const stateId of duplicateStateIds) {
		addError(
			errors,
			"states",
			"duplicate_state_id",
			`State ID "${stateId}" is used more than once.`,
		);
	}

	const requiresExecutableSpec = statusesThatRequireExecutableSpec.has(
		spec.status,
	);

	if (requiresExecutableSpec && spec.transitions.length === 0) {
		addError(
			errors,
			"transitions",
			"missing_ready_transitions",
			"Ready, running, and completed circuits require at least one transition.",
		);
	}

	const seenTransitionIds = new Set<string>();
	const duplicateTransitionIds = new Set<string>();

	spec.transitions.forEach((transition, index) => {
		const transitionPath = `transitions.${index}`;

		if (seenTransitionIds.has(transition.id)) {
			duplicateTransitionIds.add(transition.id);
		}
		seenTransitionIds.add(transition.id);

		if (!seenStateIds.has(transition.fromStateId)) {
			addError(
				errors,
				`${transitionPath}.fromStateId`,
				"unknown_from_state",
				`Transition "${transition.id}" references unknown fromStateId "${transition.fromStateId}".`,
			);
		}

		if (!seenStateIds.has(transition.toStateId)) {
			addError(
				errors,
				`${transitionPath}.toStateId`,
				"unknown_to_state",
				`Transition "${transition.id}" references unknown toStateId "${transition.toStateId}".`,
			);
		}

		if (transition.requiredEvents.length === 0) {
			addError(
				errors,
				`${transitionPath}.requiredEvents`,
				"missing_required_events",
				`Transition "${transition.id}" requires at least one event spec.`,
			);
		}

		if (transition.outputContract.requiredFields.length === 0) {
			addError(
				errors,
				`${transitionPath}.outputContract.requiredFields`,
				"missing_output_required_fields",
				`Transition "${transition.id}" requires output contract fields.`,
			);
		}

		if (requiresExecutableSpec && transition.validators.length === 0) {
			addError(
				errors,
				`${transitionPath}.validators`,
				"missing_ready_validators",
				`Transition "${transition.id}" requires at least one validator before execution.`,
			);
		}
	});

	for (const transitionId of duplicateTransitionIds) {
		addError(
			errors,
			"transitions",
			"duplicate_transition_id",
			`Transition ID "${transitionId}" is used more than once.`,
		);
	}
}
