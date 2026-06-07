import type {
	EventSpec,
	ExecutionCircuitSpec,
	ExecutionMonadSpec,
	OutputContractSpec,
	RuntimeBindingSpec,
	StateSpec,
	TransitionSpec,
	ValidatorSpec,
} from "./schemas";

type PromptSection = {
	heading: string;
	body: string;
};

function text(value: string | undefined, fallback = "Not specified."): string {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function bulletList(
	values: string[] | undefined,
	fallback = "None specified.",
): string {
	const items = values
		?.map((value) => value.trim())
		.filter((value) => value.length > 0);

	if (!items || items.length === 0) {
		return fallback;
	}

	return items.map((value) => `- ${value}`).join("\n");
}

function stateBlock(state: StateSpec): string {
	const lines = [
		`Name: ${state.name}`,
		`Description: ${text(state.description)}`,
		"",
		"Assertions:",
		bulletList(state.assertions),
	];

	if (state.evidenceRefs && state.evidenceRefs.length > 0) {
		lines.push("", "Evidence refs:", bulletList(state.evidenceRefs));
	}

	return lines.join("\n");
}

function eventBlock(events: EventSpec[]): string {
	if (events.length === 0) {
		return "No required events specified.";
	}

	return events
		.map((event, index) => {
			const lines = [
				`${index + 1}. ${event.name}`,
				`   - ID: ${event.id}`,
				`   - Required: ${event.required ? "yes" : "no"}`,
				`   - Description: ${text(event.description)}`,
			];

			if (event.evidenceHint) {
				lines.push(`   - Evidence hint: ${event.evidenceHint}`);
			}

			return lines.join("\n");
		})
		.join("\n");
}

function runtimeBlock(runtime: RuntimeBindingSpec): string {
	const lines = [
		`Kind: ${runtime.kind}`,
		`Workspace ID: ${text(runtime.workspaceId)}`,
		`Project ID: ${text(runtime.projectId)}`,
		`Branch: ${text(runtime.branch)}`,
		`Worktree path: ${text(runtime.worktreePath)}`,
		`Agent: ${text(runtime.agent)}`,
		"Commands:",
		bulletList(runtime.commands),
		`Notes: ${text(runtime.notes)}`,
	];

	return lines.join("\n");
}

function monadBlock(monad: ExecutionMonadSpec): string {
	const lines = [
		"Context refs:",
		bulletList(monad.contextRefs),
		"",
		"Tools:",
		bulletList(monad.tools),
		"",
		"Permissions:",
		bulletList(monad.permissions),
		"",
		"Constraints:",
		bulletList(monad.constraints),
		"",
		"Memory refs:",
		bulletList(monad.memoryRefs),
		"",
		"Budget:",
		monad.budget
			? bulletList([
					monad.budget.maxMinutes
						? `Max minutes: ${monad.budget.maxMinutes}`
						: "",
					monad.budget.maxToolCalls
						? `Max tool calls: ${monad.budget.maxToolCalls}`
						: "",
				])
			: "None specified.",
		"",
		"Quality criteria:",
		bulletList(monad.qualityCriteria),
	];

	return lines.join("\n");
}

function outputContractBlock(outputContract: OutputContractSpec): string {
	const lines = [
		`Format: ${outputContract.format}`,
		"Required fields:",
		bulletList(outputContract.requiredFields),
	];

	if (outputContract.artifactRefs && outputContract.artifactRefs.length > 0) {
		lines.push("", "Artifact refs:", bulletList(outputContract.artifactRefs));
	}

	return lines.join("\n");
}

function validatorBlock(validators: ValidatorSpec[]): string {
	if (validators.length === 0) {
		return "No validators specified.";
	}

	return validators
		.map((validator, index) => {
			const lines = [
				`${index + 1}. ${validator.description || "Validator"}`,
				`   - Kind: ${validator.kind}`,
				`   - Required: ${validator.required ? "yes" : "no"}`,
			];

			if (validator.command) {
				lines.push(`   - Command: ${validator.command}`);
			}
			if (validator.expected) {
				lines.push(`   - Expected: ${validator.expected}`);
			}

			return lines.join("\n");
		})
		.join("\n");
}

function transitionBlock(transition: TransitionSpec): string {
	return [
		`ID: ${transition.id}`,
		`Name: ${transition.name}`,
		`Description: ${text(transition.description)}`,
		`From state: ${transition.fromStateId}`,
		`To state: ${transition.toStateId}`,
	].join("\n");
}

function finalResponseTemplate(transitionId: string): string {
	return JSON.stringify(
		{
			transition_id: transitionId,
			status: "completed | blocked | failed",
			events_observed: [],
			files_changed: [],
			commands_run: [],
			artifacts_produced: [],
			validation_result: {
				passed: true,
				details: "",
			},
			remaining_risks: [],
			next_recommended_transition: null,
		},
		null,
		2,
	);
}

function renderSections(sections: PromptSection[]): string {
	return sections
		.filter((section) => section.body.trim().length > 0)
		.map((section) => `## ${section.heading}\n\n${section.body.trim()}`)
		.join("\n\n");
}

export function compileTransitionPrompt(
	spec: ExecutionCircuitSpec,
	transitionId: string,
): string {
	const transition = spec.transitions.find(
		(candidate) => candidate.id === transitionId,
	);

	if (!transition) {
		throw new Error(`Transition not found: ${transitionId}`);
	}

	const sections: PromptSection[] = [
		{
			heading: "Role",
			body: [
				"You are an execution agent operating inside Superset.",
				"Treat this work as a verified state transition, not a free-form terminal session.",
			].join("\n"),
		},
		{
			heading: "Task",
			body: [
				`Circuit ID: ${spec.id}`,
				`Task ID: ${spec.taskId}`,
				`Circuit title: ${spec.title}`,
				`Circuit status: ${spec.status}`,
			].join("\n"),
		},
		{
			heading: "Current State",
			body: stateBlock(spec.currentState),
		},
		{
			heading: "Target State",
			body: stateBlock(spec.targetState),
		},
		{
			heading: "Transition",
			body: transitionBlock(transition),
		},
		{
			heading: "Required Events",
			body: eventBlock(transition.requiredEvents),
		},
		{
			heading: "Runtime Binding",
			body: runtimeBlock(transition.runtime),
		},
		{
			heading: "Execution Monad",
			body: monadBlock(transition.monad),
		},
		{
			heading: "Output Contract",
			body: outputContractBlock(transition.outputContract),
		},
		{
			heading: "Validators",
			body: validatorBlock(transition.validators),
		},
		{
			heading: "Trace Requirements",
			body: [
				"Record the concrete evidence for every required event.",
				"List files changed, commands run, artifacts produced, and validation evidence.",
				"Do not mark the transition completed unless the validator evidence supports it.",
			].join("\n"),
		},
		{
			heading: "Completion Rules",
			body: [
				"Return one structured final response and no extra prose after it.",
				"Use null for next_recommended_transition when there is no next transition.",
				"Final response JSON shape:",
				"```json",
				finalResponseTemplate(transition.id),
				"```",
			].join("\n"),
		},
	];

	return renderSections(sections);
}
