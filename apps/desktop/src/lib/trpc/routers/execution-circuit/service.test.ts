import { describe, expect, it } from "bun:test";
import type {
	SelectExecutionCircuit,
	SelectExperienceTraceEvent,
	SelectTransitionRun,
} from "@rox/local-db";
import type { ExecutionCircuitSpec } from "@rox/shared/execution-circuit";
import {
	createExecutionCircuitService,
	ExecutionCircuitServiceError,
	type ExecutionCircuitStore,
	type ValidatorCommandRunner,
} from "./service";

type TestTask = {
	id: string;
	title: string;
	description: string | null;
};

type TestWorkspace = {
	id: string;
	projectId: string;
};

class FakeExecutionCircuitStore implements ExecutionCircuitStore {
	readonly tasks = new Map<string, TestTask>();
	readonly workspaces = new Map<string, TestWorkspace>();
	readonly circuits = new Map<string, SelectExecutionCircuit>();
	readonly transitionRuns = new Map<string, SelectTransitionRun>();
	readonly traceEvents = new Map<string, SelectExperienceTraceEvent>();
	private nextTransitionRun = 1;
	private nextTraceEvent = 1;

	getLatestCircuitByTaskId(taskId: string): SelectExecutionCircuit | null {
		return (
			[...this.circuits.values()]
				.filter((circuit) => circuit.taskId === taskId)
				.sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
		);
	}

	getCircuitById(circuitId: string): SelectExecutionCircuit | null {
		return this.circuits.get(circuitId) ?? null;
	}

	getTaskById(taskId: string): TestTask | null {
		return this.tasks.get(taskId) ?? null;
	}

	getWorkspaceById(workspaceId: string): TestWorkspace | null {
		return this.workspaces.get(workspaceId) ?? null;
	}

	listTransitionRuns(circuitId: string): SelectTransitionRun[] {
		return [...this.transitionRuns.values()]
			.filter((run) => run.circuitId === circuitId)
			.sort((left, right) => right.createdAt - left.createdAt);
	}

	listTraceEvents(transitionRunId: string): SelectExperienceTraceEvent[] {
		return [...this.traceEvents.values()]
			.filter((event) => event.transitionRunId === transitionRunId)
			.sort((left, right) => left.sequence - right.sequence);
	}

	insertCircuit(circuit: SelectExecutionCircuit): SelectExecutionCircuit {
		this.circuits.set(circuit.id, circuit);
		return circuit;
	}

	updateCircuit(
		id: string,
		patch: Pick<
			SelectExecutionCircuit,
			"title" | "status" | "specJson" | "validationJson" | "updatedAt"
		>,
	): SelectExecutionCircuit | null {
		const existing = this.circuits.get(id);
		if (!existing) return null;
		const updated = { ...existing, ...patch };
		this.circuits.set(id, updated);
		return updated;
	}

	insertTransitionRun(
		input: Parameters<ExecutionCircuitStore["insertTransitionRun"]>[0],
	): SelectTransitionRun {
		const now = Date.now();
		const run: SelectTransitionRun = {
			id: `transition-run-${this.nextTransitionRun++}`,
			circuitId: input.circuitId,
			transitionId: input.transitionId,
			status: input.status,
			workspaceId: input.workspaceId ?? null,
			agentRunId: input.agentRunId ?? null,
			runtimeSnapshotJson: input.runtimeSnapshotJson,
			monadSnapshotJson: input.monadSnapshotJson,
			outputJson: null,
			validationResultJson: null,
			startedAt: null,
			completedAt: null,
			createdAt: now,
			updatedAt: now,
		};
		this.transitionRuns.set(run.id, run);
		return run;
	}

	getTransitionRun(transitionRunId: string): SelectTransitionRun | null {
		return this.transitionRuns.get(transitionRunId) ?? null;
	}

	insertTraceEvent(
		input: Parameters<ExecutionCircuitStore["insertTraceEvent"]>[0],
	): SelectExperienceTraceEvent {
		const sequence =
			(this.listTraceEvents(input.transitionRunId).at(-1)?.sequence ?? 0) + 1;
		const event: SelectExperienceTraceEvent = {
			id: `trace-event-${this.nextTraceEvent++}`,
			transitionRunId: input.transitionRunId,
			sequence,
			type: input.type,
			message: input.message,
			payloadJson: input.payloadJson ?? null,
			createdAt: Date.now(),
		};
		this.traceEvents.set(event.id, event);
		return event;
	}

	updateTransitionRun(
		transitionRunId: string,
		patch: Partial<
			Pick<
				SelectTransitionRun,
				| "status"
				| "outputJson"
				| "validationResultJson"
				| "completedAt"
				| "updatedAt"
			>
		>,
	): SelectTransitionRun | null {
		const existing = this.transitionRuns.get(transitionRunId);
		if (!existing) return null;
		const updated = { ...existing, ...patch };
		this.transitionRuns.set(transitionRunId, updated);
		return updated;
	}
}

function createStoreWithTask() {
	const store = new FakeExecutionCircuitStore();
	store.tasks.set("task-1", {
		id: "task-1",
		title: "Implement state transition layer",
		description: "Create a durable execution circuit MVP.",
	});
	store.workspaces.set("workspace-1", {
		id: "workspace-1",
		projectId: "project-1",
	});
	return store;
}

function createReadySpec(spec: ExecutionCircuitSpec): ExecutionCircuitSpec {
	return {
		...spec,
		status: "ready",
		transitions: spec.transitions.map((transition) => ({
			...transition,
			runtime: {
				...transition.runtime,
				kind: "workspace",
				workspaceId: "workspace-1",
				projectId: "project-1",
				agent: "codex",
			},
			validators: [
				...transition.validators,
				{
					kind: "typecheck",
					description: "Desktop typecheck passes.",
					command: "bun run --cwd apps/desktop typecheck",
					expected: "exit 0",
					required: true,
				},
			],
		})),
	};
}

function createTwoStepReadySpec(
	spec: ExecutionCircuitSpec,
): ExecutionCircuitSpec {
	const baseTransition = createReadySpec(spec).transitions[0];
	if (!baseTransition) {
		throw new Error("Expected draft transition.");
	}

	return {
		...spec,
		status: "ready",
		intermediateStates: [
			{
				id: "implemented",
				name: "Implemented",
				description: "The implementation step produced a candidate change.",
				assertions: ["Candidate implementation exists."],
			},
		],
		transitions: [
			{
				...baseTransition,
				id: "implement",
				name: "Implement",
				fromStateId: "current-task-state",
				toStateId: "implemented",
			},
			{
				...baseTransition,
				id: "verify",
				name: "Verify",
				fromStateId: "implemented",
				toStateId: "verified-task-completion",
			},
		],
	};
}

describe("execution circuit service", () => {
	it("creates and returns a draft circuit for a task", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);

		const circuit = service.createDraftForTask("task-1");

		expect(circuit.taskId).toBe("task-1");
		expect(circuit.specJson.targetState.description).toBe(
			"Create a durable execution circuit MVP.",
		);
		expect(service.getByTaskId("task-1")?.id).toBe(circuit.id);
	});

	it("returns an existing draft instead of creating duplicates", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);

		const first = service.createDraftForTask("task-1");
		const second = service.createDraftForTask("task-1");

		expect(second.id).toBe(first.id);
		expect(store.circuits.size).toBe(1);
	});

	it("rejects invalid specs", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);

		expect(() =>
			service.upsertSpec("task-1", {
				version: 1,
				taskId: "task-1",
			}),
		).toThrow(ExecutionCircuitServiceError);
	});

	it("rejects specs for missing tasks", () => {
		const store = new FakeExecutionCircuitStore();
		const service = createExecutionCircuitService(store);
		const draft = createExecutionCircuitService(
			createStoreWithTask(),
		).createDraftForTask("task-1").specJson;

		expect(() => service.upsertSpec("task-1", draft)).toThrow(
			ExecutionCircuitServiceError,
		);
	});

	it("saves a valid spec and compiles a transition prompt", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const readySpec = createReadySpec(draft.specJson);

		const saved = service.upsertSpec("task-1", readySpec);
		const prompt = service.compileTransitionPrompt(
			saved.id,
			"define-and-execute-task-transition",
		);

		expect(saved.status).toBe("ready");
		expect(prompt).toContain("## Execution Monad");
		expect(prompt).toContain("Desktop typecheck passes.");
	});

	it("creates transition runs with runtime and monad snapshots", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");

		const run = service.createTransitionRun({
			circuitId: draft.id,
			transitionId: "define-and-execute-task-transition",
			workspaceId: "workspace-1",
			agentRunId: "agent-run-1",
		});

		expect(run.status).toBe("pending");
		expect(run.runtimeSnapshotJson.kind).toBe("unspecified");
		expect(run.monadSnapshotJson.contextRefs).toContain("task:task-1");
	});

	it("plans an ordered transition graph for a circuit", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec(
			"task-1",
			createTwoStepReadySpec(draft.specJson),
		);

		const graph = service.getTransitionGraph(ready.id);

		expect(graph.orderedTransitionIds).toEqual(["implement", "verify"]);
		expect(graph.nextTransitionId).toBe("implement");
		expect(graph.nodes.map((node) => node.status)).toEqual([
			"available",
			"blocked",
		]);
	});

	it("creates the next ordered transition run and advances after completion", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec(
			"task-1",
			createTwoStepReadySpec(draft.specJson),
		);

		const firstRun = service.createNextTransitionRun({
			circuitId: ready.id,
			workspaceId: "workspace-1",
		});
		const duplicateStart = service.createNextTransitionRun({
			circuitId: ready.id,
			workspaceId: "workspace-1",
		});

		expect(firstRun.transitionId).toBe("implement");
		expect(duplicateStart.id).toBe(firstRun.id);

		service.completeTransitionRun({
			transitionRunId: firstRun.id,
			output: {
				transition_id: "implement",
				status: "completed",
				events_observed: ["Implementation exists"],
				files_changed: ["src/example.ts"],
				commands_run: ["bun test"],
				artifacts_produced: [],
				validation_result: {
					passed: true,
					details: "Implementation step complete.",
				},
				remaining_risks: [],
				next_recommended_transition: "verify",
			},
			validationResult: {
				passed: true,
				details: "Implementation step complete.",
			},
		});

		const secondRun = service.createNextTransitionRun({
			circuitId: ready.id,
			workspaceId: "workspace-1",
		});

		expect(secondRun.transitionId).toBe("verify");
		expect(service.getTransitionGraph(ready.id).nextTransitionId).toBe(
			"verify",
		);
	});

	it("rejects transition runs for unknown workspaces", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");

		expect(() =>
			service.createTransitionRun({
				circuitId: draft.id,
				transitionId: "define-and-execute-task-transition",
				workspaceId: "missing-workspace",
			}),
		).toThrow(ExecutionCircuitServiceError);
	});

	it("rejects transition runs whose workspace conflicts with runtime binding", () => {
		const store = createStoreWithTask();
		store.workspaces.set("workspace-2", {
			id: "workspace-2",
			projectId: "project-2",
		});
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec("task-1", createReadySpec(draft.specJson));

		expect(() =>
			service.createTransitionRun({
				circuitId: ready.id,
				transitionId: "define-and-execute-task-transition",
				workspaceId: "workspace-2",
			}),
		).toThrow(ExecutionCircuitServiceError);
	});

	it("appends trace events with increasing sequence numbers", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const run = service.createTransitionRun({
			circuitId: draft.id,
			transitionId: "define-and-execute-task-transition",
		});

		const first = service.appendTraceEvent({
			transitionRunId: run.id,
			type: "command",
			message: "Ran typecheck",
		});
		const second = service.appendTraceEvent({
			transitionRunId: run.id,
			type: "validation",
			message: "Typecheck passed",
		});

		expect(first.sequence).toBe(1);
		expect(second.sequence).toBe(2);
		expect(
			service.getByTaskId("task-1")?.transitionRuns[0]?.traceEvents,
		).toHaveLength(2);
	});

	it("completes a transition run with output and validation result", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const run = service.createTransitionRun({
			circuitId: draft.id,
			transitionId: "define-and-execute-task-transition",
		});

		const completed = service.completeTransitionRun({
			transitionRunId: run.id,
			output: {
				transition_id: "define-and-execute-task-transition",
				status: "completed",
				events_observed: ["Inspected task context"],
				files_changed: [],
				commands_run: [
					"bun test apps/desktop/src/lib/trpc/routers/execution-circuit/service.test.ts",
				],
				artifacts_produced: [],
				validation_result: {
					passed: true,
					details: "All targeted checks passed.",
				},
				remaining_risks: [],
				next_recommended_transition: null,
			},
			validationResult: {
				passed: true,
				details: "All targeted checks passed.",
			},
		});

		expect(completed.status).toBe("completed");
		expect(completed.validationResultJson?.passed).toBe(true);
	});

	it("exports and imports a circuit spec for the current task", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec("task-1", createReadySpec(draft.specJson));

		const exported = service.exportSpec(ready.id);
		const imported = service.importSpecForTask("task-1", exported);

		expect(JSON.parse(exported)).toMatchObject({
			taskId: "task-1",
			status: "ready",
		});
		expect(imported.specJson.status).toBe("ready");
		expect(imported.validationJson.ok).toBe(true);
	});

	it("imports exported circuit specs into a different task by rebinding taskId", () => {
		const store = createStoreWithTask();
		store.tasks.set("task-2", {
			id: "task-2",
			title: "Reuse workflow",
			description: "Import a saved circuit.",
		});
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec("task-1", createReadySpec(draft.specJson));

		const imported = service.importSpecForTask(
			"task-2",
			service.exportSpec(ready.id),
		);

		expect(imported.taskId).toBe("task-2");
		expect(imported.specJson.taskId).toBe("task-2");
		expect(imported.specJson.id).toBe("execution-circuit-task-2");
	});

	it("runs executable validators and records trace evidence", async () => {
		const store = createStoreWithTask();
		const commands: string[] = [];
		const commandRunner: ValidatorCommandRunner = async (command) => {
			commands.push(command);
			return {
				exitCode: 0,
				signal: null,
				stdout: "ok",
				stderr: "",
				timedOut: false,
			};
		};
		const service = createExecutionCircuitService(store, {
			commandRunner,
			defaultCwd: "/tmp",
		});
		const draft = service.createDraftForTask("task-1");
		const ready = service.upsertSpec("task-1", createReadySpec(draft.specJson));
		const run = service.createTransitionRun({
			circuitId: ready.id,
			transitionId: "define-and-execute-task-transition",
			workspaceId: "workspace-1",
		});

		const summary = await service.runValidatorsForTransitionRun(run.id);

		expect(summary.passed).toBe(true);
		expect(commands).toEqual(["bun run --cwd apps/desktop typecheck"]);
		expect(summary.records).toContainEqual(
			expect.objectContaining({
				kind: "typecheck",
				status: "passed",
				exitCode: 0,
			}),
		);
		expect(store.getTransitionRun(run.id)?.validationResultJson?.passed).toBe(
			true,
		);
		expect(store.listTraceEvents(run.id).map((event) => event.type)).toContain(
			"validator.passed",
		);
	});

	it("fails required automatic validators outside the command allowlist", async () => {
		const store = createStoreWithTask();
		const commandRunner: ValidatorCommandRunner = async () => {
			throw new Error("Disallowed command should not run.");
		};
		const service = createExecutionCircuitService(store, {
			commandRunner,
			defaultCwd: "/tmp",
		});
		const draft = service.createDraftForTask("task-1");
		const readySpec = createReadySpec(draft.specJson);
		const [transition] = readySpec.transitions;
		if (!transition) throw new Error("Expected transition.");
		const ready = service.upsertSpec("task-1", {
			...readySpec,
			transitions: [
				{
					...transition,
					validators: [
						{
							kind: "command",
							description: "Unsupported command.",
							command: "curl https://example.com",
							required: true,
						},
					],
				},
			],
		});
		const run = service.createTransitionRun({
			circuitId: ready.id,
			transitionId: "define-and-execute-task-transition",
			workspaceId: "workspace-1",
		});

		const summary = await service.runValidatorsForTransitionRun(run.id);

		expect(summary.passed).toBe(false);
		expect(summary.records[0]).toMatchObject({
			status: "failed",
			details:
				"Validator command is outside the automatic execution allowlist.",
		});
		expect(store.getTransitionRun(run.id)?.status).toBe("failed");
	});

	it("rejects incomplete transition run output", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const run = service.createTransitionRun({
			circuitId: draft.id,
			transitionId: "define-and-execute-task-transition",
		});

		expect(() =>
			service.completeTransitionRun({
				transitionRunId: run.id,
				output: {
					transition_id: "define-and-execute-task-transition",
					status: "completed",
				} as never,
				validationResult: {
					passed: true,
					details: "Missing fields should fail.",
				},
			}),
		).toThrow(ExecutionCircuitServiceError);
	});

	it("rejects transition output for the wrong transition ID", () => {
		const store = createStoreWithTask();
		const service = createExecutionCircuitService(store);
		const draft = service.createDraftForTask("task-1");
		const run = service.createTransitionRun({
			circuitId: draft.id,
			transitionId: "define-and-execute-task-transition",
		});

		expect(() =>
			service.completeTransitionRun({
				transitionRunId: run.id,
				output: {
					transition_id: "other-transition",
					status: "completed",
					events_observed: [],
					files_changed: [],
					commands_run: [],
					artifacts_produced: [],
					validation_result: {
						passed: true,
						details: "Wrong transition.",
					},
					remaining_risks: [],
					next_recommended_transition: null,
				},
				validationResult: {
					passed: true,
					details: "Wrong transition should fail.",
				},
			}),
		).toThrow(ExecutionCircuitServiceError);
	});
});
