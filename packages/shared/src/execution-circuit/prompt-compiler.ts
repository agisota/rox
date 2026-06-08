import type {
	ExecutionCircuitSpec,
	StateSpec,
	TransitionSpec,
	ValidatorSpec,
} from "./types";

export class UnknownTransitionError extends Error {
	constructor(public readonly transitionId: string) {
		super(`No transition with id "${transitionId}" in this circuit.`);
		this.name = "UnknownTransitionError";
	}
}

function bullets(
	items: string[] | undefined,
	empty = "_(none specified)_",
): string {
	const list = (items ?? []).filter(
		(s) => s != null && String(s).trim() !== "",
	);
	if (list.length === 0) return empty;
	return list.map((s) => `- ${s}`).join("\n");
}

function stateBlock(state: StateSpec): string {
	return [
		`Name: ${state.name || "(unnamed)"}`,
		`Description: ${state.description || "(none)"}`,
		"Assertions:",
		bullets(state.assertions),
	].join("\n");
}

function validatorLine(v: ValidatorSpec): string {
	const parts = [
		`(${v.kind}${v.required ? ", required" : ", optional"})`,
		v.description,
	];
	if (v.command) parts.push(`— command: \`${v.command}\``);
	return `- ${parts.filter(Boolean).join(" ")}`;
}

/**
 * Compile a deterministic, copy-pasteable agent prompt for one transition.
 * Every section is always present; missing data renders as an explicit
 * placeholder rather than literal `undefined`/`[object Object]`.
 */
export function compileTransitionPrompt(
	spec: ExecutionCircuitSpec,
	transitionId: string,
): string {
	const transition: TransitionSpec | undefined = spec.transitions.find(
		(t) => t.id === transitionId,
	);
	if (!transition) throw new UnknownTransitionError(transitionId);

	const fromState =
		[spec.currentState, spec.targetState, ...spec.intermediateStates].find(
			(s) => s.id === transition.fromStateId,
		) ?? spec.currentState;
	const toState =
		[spec.currentState, spec.targetState, ...spec.intermediateStates].find(
			(s) => s.id === transition.toStateId,
		) ?? spec.targetState;

	const runtime = transition.runtime;
	const monad = transition.monad;

	const finalResponseShape = JSON.stringify(
		{
			transition_id: transition.id,
			status: "completed | blocked | failed",
			events_observed: [],
			files_changed: [],
			commands_run: [],
			artifacts_produced: [],
			validation_result: { passed: true, details: "" },
			remaining_risks: [],
			next_recommended_transition: null,
		},
		null,
		2,
	);

	return [
		"## Role",
		"You are an execution agent completing one verified state transition for a task.",
		"",
		"## Task",
		`Circuit: ${spec.title || "(untitled)"} (task ${spec.taskId})`,
		`Transition: ${transition.name || transition.id} — ${transition.description || "(no description)"}`,
		"",
		"## Current State",
		stateBlock(fromState),
		"",
		"## Target State",
		stateBlock(toState),
		"",
		"## Required Events (must be observed)",
		bullets(
			transition.requiredEvents.map((e) =>
				e.required
					? `${e.name}: ${e.description}`
					: `${e.name} (optional): ${e.description}`,
			),
		),
		"",
		"## Runtime Binding",
		`Kind: ${runtime.kind}`,
		runtime.agent ? `Agent: ${runtime.agent}` : "Agent: (unspecified)",
		runtime.worktreePath ? `Worktree: ${runtime.worktreePath}` : null,
		runtime.branch ? `Branch: ${runtime.branch}` : null,
		runtime.notes ? `Notes: ${runtime.notes}` : null,
		"",
		"## Execution Monad (context, tools, constraints)",
		"Context refs:",
		bullets(monad.contextRefs),
		"Tools:",
		bullets(monad.tools),
		"Constraints:",
		bullets(monad.constraints),
		"Quality criteria:",
		bullets(monad.qualityCriteria),
		"",
		"## Output Contract",
		`Format: ${transition.outputContract.format}`,
		"Required fields:",
		bullets(transition.outputContract.requiredFields),
		"",
		"## Validators (proof the transition succeeded)",
		transition.validators.length > 0
			? transition.validators.map(validatorLine).join("\n")
			: "_(none specified)_",
		"",
		"## Trace Requirements",
		"Record every observed event, file changed, and command run; attach validation evidence.",
		"",
		"## Completion Rules",
		"Do NOT report completion until the target-state assertions hold and validators pass.",
		"End with EXACTLY this JSON as your final structured response:",
		"```json",
		finalResponseShape,
		"```",
	]
		.filter((line): line is string => line !== null)
		.join("\n");
}
