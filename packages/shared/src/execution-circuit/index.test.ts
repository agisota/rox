import { describe, expect, it } from "bun:test";
import {
	compileTransitionPrompt,
	computeMonadCompleteness,
	type ExecutionCircuitSpec,
	exportExecutionCircuitSpec,
	importExecutionCircuitSpec,
	planExecutionCircuitGraph,
	type TransitionSpec,
	validateExecutionCircuitSpec,
} from ".";

const finalResponseFields = [
	"transition_id",
	"status",
	"events_observed",
	"files_changed",
	"commands_run",
	"artifacts_produced",
	"validation_result",
	"remaining_risks",
	"next_recommended_transition",
];

function validTransition(
	overrides: Partial<TransitionSpec> = {},
): TransitionSpec {
	return {
		id: "transition-1",
		name: "Implement verified change",
		description: "Move the task from captured intent to verified completion.",
		fromStateId: "current",
		toStateId: "target",
		requiredEvents: [
			{
				id: "inspect-context",
				name: "Inspect task context",
				description: "Read relevant files, task notes, and existing tests.",
				required: true,
				evidenceHint: "List inspected files and notes.",
			},
		],
		runtime: {
			kind: "workspace",
			workspaceId: "workspace-1",
			projectId: "project-1",
			agent: "codex",
			commands: ["bun test"],
		},
		monad: {
			contextRefs: ["task.description"],
			tools: ["shell", "apply_patch"],
			permissions: ["read", "write"],
			constraints: ["Keep the diff scoped."],
			memoryRefs: ["project.AGENTS.md"],
			budget: {
				maxMinutes: 30,
				maxToolCalls: 20,
			},
			qualityCriteria: ["Relevant tests pass."],
		},
		outputContract: {
			format: "json",
			requiredFields: finalResponseFields,
			artifactRefs: ["test-report"],
		},
		validators: [
			{
				kind: "test",
				description: "Run focused unit tests.",
				command: "bun test",
				expected: "exit code 0",
				required: true,
			},
		],
		...overrides,
	};
}

function validCircuit(
	overrides: Partial<ExecutionCircuitSpec> = {},
): ExecutionCircuitSpec {
	return {
		version: 1,
		id: "circuit-1",
		taskId: "task-1",
		title: "Execution Circuit",
		status: "draft",
		currentState: {
			id: "current",
			name: "Current task state",
			description: "The task has been captured.",
			assertions: ["The task exists in Superset."],
			evidenceRefs: ["task-1"],
		},
		targetState: {
			id: "target",
			name: "Verified completion",
			description: "The requested change is implemented or explicitly blocked.",
			assertions: ["Relevant validation evidence is attached."],
		},
		intermediateStates: [],
		transitions: [validTransition()],
		createdAt: "2026-06-07T00:00:00.000Z",
		updatedAt: "2026-06-07T00:00:00.000Z",
		...overrides,
	};
}

describe("validateExecutionCircuitSpec", () => {
	it("accepts a valid minimal draft circuit", () => {
		const result = validateExecutionCircuitSpec(validCircuit());

		expect(result.ok).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("accepts a valid ready circuit with one transition and validator", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({ status: "ready" }),
		);

		expect(result.ok).toBe(true);
	});

	it("rejects missing current state", () => {
		const spec = { ...validCircuit(), currentState: undefined };

		const result = validateExecutionCircuitSpec(spec);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_current_state",
		);
	});

	it("rejects missing target state", () => {
		const spec = { ...validCircuit(), targetState: undefined };

		const result = validateExecutionCircuitSpec(spec);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_target_state",
		);
	});

	it("rejects duplicate state IDs", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				intermediateStates: [
					{
						id: "current",
						name: "Duplicate",
						description: "Duplicate state.",
						assertions: ["Duplicate state exists."],
					},
				],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"duplicate_state_id",
		);
	});

	it("rejects duplicate transition IDs", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				transitions: [validTransition(), validTransition()],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"duplicate_transition_id",
		);
	});

	it("rejects transition with nonexistent fromStateId", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				transitions: [validTransition({ fromStateId: "missing" })],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"unknown_from_state",
		);
	});

	it("rejects transition with nonexistent toStateId", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				transitions: [validTransition({ toStateId: "missing" })],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"unknown_to_state",
		);
	});

	it("rejects ready circuit with zero transitions", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({ status: "ready", transitions: [] }),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_ready_transitions",
		);
	});

	it("rejects ready transition with no required events", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				status: "ready",
				transitions: [validTransition({ requiredEvents: [] })],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_required_events",
		);
	});

	it("rejects ready transition with no validators", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				status: "ready",
				transitions: [validTransition({ validators: [] })],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_ready_validators",
		);
	});

	it("rejects output contract with empty requiredFields", () => {
		const result = validateExecutionCircuitSpec(
			validCircuit({
				transitions: [
					validTransition({
						outputContract: { format: "json", requiredFields: [] },
					}),
				],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.map((error) => error.code)).toContain(
			"missing_output_required_fields",
		);
	});
});

describe("computeMonadCompleteness", () => {
	it("returns low score and missing fields for empty or unspecified monad", () => {
		const result = computeMonadCompleteness(
			validTransition({
				runtime: { kind: "unspecified" },
				monad: {
					contextRefs: [],
					tools: [],
					permissions: [],
					constraints: [],
					memoryRefs: [],
					qualityCriteria: [],
				},
				outputContract: { format: "json", requiredFields: [] },
				validators: [],
				requiredEvents: [],
			}),
		);

		expect(result.score).toBeLessThan(50);
		expect(result.missing).toContain("Runtime selected");
		expect(result.missing).toContain("Context references");
		expect(result.missing).toContain("Validator");
	});

	it("returns partial score when runtime, context, and tools exist but validators are missing", () => {
		const result = computeMonadCompleteness(
			validTransition({
				validators: [],
			}),
		);

		expect(result.score).toBeGreaterThan(50);
		expect(result.score).toBeLessThan(100);
		expect(result.missing).toContain("Validator");
	});

	it("returns 100 when all required dimensions are present", () => {
		const result = computeMonadCompleteness(validTransition());

		expect(result.score).toBe(100);
		expect(result.missing).toHaveLength(0);
	});

	it("includes readable missing labels suitable for UI display", () => {
		const result = computeMonadCompleteness(
			validTransition({
				runtime: { kind: "unspecified" },
				monad: {
					contextRefs: [],
					tools: [],
					permissions: [],
					constraints: [],
					memoryRefs: [],
					qualityCriteria: [],
				},
			}),
		);

		expect(result.missing.every((label) => /^[A-Z]/.test(label))).toBe(true);
	});
});

describe("compileTransitionPrompt", () => {
	it("generated prompt includes all required headings", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		for (const heading of [
			"## Role",
			"## Task",
			"## Current State",
			"## Target State",
			"## Transition",
			"## Required Events",
			"## Runtime Binding",
			"## Execution Monad",
			"## Output Contract",
			"## Validators",
			"## Trace Requirements",
			"## Completion Rules",
		]) {
			expect(prompt).toContain(heading);
		}
	});

	it("generated prompt includes current state assertions", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).toContain("The task exists in Superset.");
	});

	it("generated prompt includes target state assertions", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).toContain("Relevant validation evidence is attached.");
	});

	it("generated prompt includes each required event", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).toContain("Inspect task context");
		expect(prompt).toContain("List inspected files and notes.");
	});

	it("generated prompt includes validators", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).toContain("Run focused unit tests.");
		expect(prompt).toContain("bun test");
	});

	it("generated prompt includes the required JSON final response structure", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		for (const field of finalResponseFields) {
			expect(prompt).toContain(`"${field}"`);
		}
		expect(prompt).toContain('"next_recommended_transition": null');
	});

	it("generated prompt does not include undefined", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).not.toContain("undefined");
	});

	it("generated prompt does not include object stringification", () => {
		const prompt = compileTransitionPrompt(validCircuit(), "transition-1");

		expect(prompt).not.toContain("[object Object]");
	});

	it("unknown transition ID throws", () => {
		expect(() =>
			compileTransitionPrompt(validCircuit(), "missing-transition"),
		).toThrow("Transition not found");
	});
});

describe("planExecutionCircuitGraph", () => {
	function twoStepCircuit(): ExecutionCircuitSpec {
		return validCircuit({
			intermediateStates: [
				{
					id: "reviewed",
					name: "Reviewed",
					description: "Implementation has been reviewed.",
					assertions: ["Review evidence exists."],
				},
			],
			transitions: [
				validTransition({
					id: "implement",
					name: "Implement",
					fromStateId: "current",
					toStateId: "reviewed",
				}),
				validTransition({
					id: "verify",
					name: "Verify",
					fromStateId: "reviewed",
					toStateId: "target",
				}),
			],
		});
	}

	it("orders transitions from the current state", () => {
		const plan = planExecutionCircuitGraph(twoStepCircuit());

		expect(plan.orderedTransitionIds).toEqual(["implement", "verify"]);
		expect(plan.nextTransitionId).toBe("implement");
		expect(plan.nodes.map((node) => node.status)).toEqual([
			"available",
			"blocked",
		]);
	});

	it("uses completed transition runs to unlock the next transition", () => {
		const plan = planExecutionCircuitGraph(twoStepCircuit(), [
			{
				transitionId: "implement",
				status: "completed",
				updatedAt: 2,
			},
		]);

		expect(plan.reachableStateIds).toContain("reviewed");
		expect(plan.completedTransitionIds).toEqual(["implement"]);
		expect(plan.nextTransitionId).toBe("verify");
		expect(plan.nodes.map((node) => node.status)).toEqual([
			"completed",
			"available",
		]);
	});

	it("returns no next transition when all ordered transitions are complete", () => {
		const plan = planExecutionCircuitGraph(twoStepCircuit(), [
			{ transitionId: "implement", status: "completed", updatedAt: 2 },
			{ transitionId: "verify", status: "completed", updatedAt: 3 },
		]);

		expect(plan.nextTransitionId).toBeNull();
		expect(plan.reachableStateIds).toContain("target");
	});

	it("keeps unreachable transitions visible as blocked nodes", () => {
		const plan = planExecutionCircuitGraph(
			validCircuit({
				transitions: [
					validTransition({
						id: "orphan",
						fromStateId: "target",
						toStateId: "current",
					}),
				],
			}),
		);

		expect(plan.nextTransitionId).toBeNull();
		expect(plan.nodes[0]).toMatchObject({
			transitionId: "orphan",
			status: "blocked",
			blockingStateIds: ["target"],
		});
	});
});

describe("execution circuit import/export", () => {
	it("exports validated specs as stable pretty JSON", () => {
		const exported = exportExecutionCircuitSpec(validCircuit());

		expect(exported).toStartWith("{\n");
		expect(exported).toEndWith("\n");
		expect(JSON.parse(exported)).toMatchObject({
			id: "circuit-1",
			taskId: "task-1",
		});
	});

	it("imports valid exported specs", () => {
		const result = importExecutionCircuitSpec(
			exportExecutionCircuitSpec(validCircuit()),
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.spec.id).toBe("circuit-1");
			expect(result.validation.ok).toBe(true);
		}
	});

	it("returns structured errors for invalid JSON", () => {
		const result = importExecutionCircuitSpec("{not-json");

		expect(result.ok).toBe(false);
		expect(result.validation.errors[0]?.code).toBe("invalid_json");
	});

	it("returns semantic validation errors for invalid specs", () => {
		const result = importExecutionCircuitSpec(
			JSON.stringify(validCircuit({ status: "ready", transitions: [] })),
		);

		expect(result.ok).toBe(false);
		expect(result.validation.errors.map((error) => error.code)).toContain(
			"missing_ready_transitions",
		);
	});
});
