import { spawn } from "node:child_process";
import type {
	SelectExecutionCircuit,
	SelectExperienceTraceEvent,
	SelectTask,
	SelectTransitionRun,
	SelectWorkspace,
} from "@superset/local-db";
import {
	compileTransitionPrompt,
	createDraftExecutionCircuitForTask,
	type ExecutionCircuitSpec,
	executionCircuitSpecSchema,
	exportExecutionCircuitSpec,
	importExecutionCircuitSpec,
	planExecutionCircuitGraph,
	type RuntimeBindingSpec,
	type TraceEventPayload,
	type TransitionGraphPlan,
	type TransitionRunOutput,
	type TransitionValidationResult,
	transitionRunOutputSchema,
	type ValidatorExecutionRecord,
	type ValidatorExecutionSummary,
	type ValidatorSpec,
	validateExecutionCircuitSpec,
} from "@superset/shared/execution-circuit";
import { parse } from "shell-quote";

export type ExecutionCircuitWithRuns = SelectExecutionCircuit & {
	transitionRuns: Array<
		SelectTransitionRun & {
			traceEvents: SelectExperienceTraceEvent[];
		}
	>;
};

export type CreateTransitionRunInput = {
	circuitId: string;
	transitionId: string;
	workspaceId?: string;
	agentRunId?: string;
};

export type AppendTraceEventInput = {
	transitionRunId: string;
	type: string;
	message: string;
	payload?: TraceEventPayload;
};

export type CompleteTransitionRunInput = {
	transitionRunId: string;
	output: TransitionRunOutput;
	validationResult: TransitionValidationResult;
};

export type ValidatorCommandRunOptions = {
	cwd: string;
	timeoutMs: number;
};

export type ValidatorCommandRunResult = {
	exitCode: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

export type ValidatorCommandRunner = (
	command: string,
	options: ValidatorCommandRunOptions,
) => Promise<ValidatorCommandRunResult>;

export type ExecutionCircuitServiceOptions = {
	commandRunner?: ValidatorCommandRunner;
	defaultCwd?: string;
	now?: () => number;
	validatorTimeoutMs?: number;
	allowedValidatorCommands?: string[];
};

export type ExecutionCircuitStore = {
	getLatestCircuitByTaskId(taskId: string): SelectExecutionCircuit | null;
	getCircuitById(circuitId: string): SelectExecutionCircuit | null;
	getTaskById(
		taskId: string,
	): Pick<SelectTask, "id" | "title" | "description"> | null;
	getWorkspaceById(
		workspaceId: string,
	): Pick<SelectWorkspace, "id" | "projectId"> | null;
	listTransitionRuns(circuitId: string): SelectTransitionRun[];
	listTraceEvents(transitionRunId: string): SelectExperienceTraceEvent[];
	insertCircuit(
		circuit: Pick<
			SelectExecutionCircuit,
			| "id"
			| "taskId"
			| "title"
			| "status"
			| "specJson"
			| "validationJson"
			| "createdAt"
			| "updatedAt"
		>,
	): SelectExecutionCircuit;
	updateCircuit(
		id: string,
		patch: Pick<
			SelectExecutionCircuit,
			"title" | "status" | "specJson" | "validationJson" | "updatedAt"
		>,
	): SelectExecutionCircuit | null;
	insertTransitionRun(input: {
		circuitId: string;
		transitionId: string;
		status: SelectTransitionRun["status"];
		workspaceId?: string;
		agentRunId?: string;
		runtimeSnapshotJson: RuntimeBindingSpec;
		monadSnapshotJson: SelectTransitionRun["monadSnapshotJson"];
	}): SelectTransitionRun;
	getTransitionRun(transitionRunId: string): SelectTransitionRun | null;
	insertTraceEvent(input: {
		transitionRunId: string;
		type: string;
		message: string;
		payloadJson?: TraceEventPayload;
	}): SelectExperienceTraceEvent;
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
	): SelectTransitionRun | null;
};

export class ExecutionCircuitServiceError extends Error {
	readonly code: "BAD_REQUEST" | "NOT_FOUND";
	readonly cause?: unknown;

	constructor(
		code: ExecutionCircuitServiceError["code"],
		message: string,
		options?: { cause?: unknown },
	) {
		super(message);
		this.name = "ExecutionCircuitServiceError";
		this.code = code;
		this.cause = options?.cause;
	}
}

function hydrateCircuit(
	store: ExecutionCircuitStore,
	circuit: SelectExecutionCircuit,
): ExecutionCircuitWithRuns {
	const runs = store.listTransitionRuns(circuit.id);
	return {
		...circuit,
		transitionRuns: runs.map((run) => ({
			...run,
			traceEvents: store.listTraceEvents(run.id),
		})),
	};
}

function parseAndValidateSpec(spec: unknown) {
	const parsed = executionCircuitSpecSchema.safeParse(spec);
	const validation = validateExecutionCircuitSpec(spec);

	if (!parsed.success || !validation.ok) {
		throw new ExecutionCircuitServiceError(
			"BAD_REQUEST",
			"Invalid execution circuit spec",
			{ cause: validation.errors },
		);
	}

	return {
		spec: parsed.data,
		validation,
	};
}

function assertTaskExists(store: ExecutionCircuitStore, taskId: string) {
	const task = store.getTaskById(taskId);
	if (!task) {
		throw new ExecutionCircuitServiceError("NOT_FOUND", "Task not found");
	}
	return task;
}

function assertWorkspaceBinding(
	store: ExecutionCircuitStore,
	inputWorkspaceId: string | undefined,
	runtime: RuntimeBindingSpec,
) {
	const workspaceId = inputWorkspaceId ?? runtime.workspaceId;
	if (!workspaceId) {
		return;
	}

	const workspace = store.getWorkspaceById(workspaceId);
	if (!workspace) {
		throw new ExecutionCircuitServiceError("NOT_FOUND", "Workspace not found");
	}

	if (runtime.workspaceId && runtime.workspaceId !== workspace.id) {
		throw new ExecutionCircuitServiceError(
			"BAD_REQUEST",
			"Transition run workspace does not match runtime binding",
		);
	}

	if (runtime.projectId && runtime.projectId !== workspace.projectId) {
		throw new ExecutionCircuitServiceError(
			"BAD_REQUEST",
			"Transition run workspace project does not match runtime binding",
		);
	}
}

const executableValidatorKinds = new Set<ValidatorSpec["kind"]>([
	"command",
	"test",
	"lint",
	"typecheck",
]);

const defaultAllowedValidatorCommands = [
	"bun",
	"bunx",
	"mise",
	"git",
	"tsc",
	"biome",
];

const defaultValidatorTimeoutMs = 120_000;
const outputCaptureLimit = 20_000;

function truncateOutput(value: string) {
	if (value.length <= outputCaptureLimit) {
		return value;
	}
	return `${value.slice(0, outputCaptureLimit)}\n[truncated]`;
}

function chunkToString(chunk: string | Buffer) {
	return Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
}

function parseValidatorCommand(commandText: string) {
	const tokens = parse(commandText);
	const stringTokens: string[] = [];

	for (const token of tokens) {
		if (typeof token !== "string") {
			return null;
		}
		stringTokens.push(token);
	}

	const [command, ...args] = stringTokens;
	if (!command) {
		return null;
	}

	return { command, args };
}

function commandBasename(command: string) {
	return command.split(/[\\/]/).at(-1) ?? command;
}

function isAllowedValidatorCommand(commandText: string, allowed: Set<string>) {
	const parsed = parseValidatorCommand(commandText);
	if (!parsed) {
		return false;
	}
	return allowed.has(commandBasename(parsed.command));
}

function createNodeValidatorCommandRunner(): ValidatorCommandRunner {
	return (commandText, options) =>
		new Promise((resolve) => {
			const parsed = parseValidatorCommand(commandText);
			if (!parsed) {
				resolve({
					exitCode: null,
					signal: null,
					stdout: "",
					stderr: "Unsupported shell syntax in validator command.",
					timedOut: false,
				});
				return;
			}

			let stdout = "";
			let stderr = "";
			let timedOut = false;
			const child = spawn(parsed.command, parsed.args, {
				cwd: options.cwd,
				env: process.env,
				stdio: ["ignore", "pipe", "pipe"],
			});

			const timeout = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
			}, options.timeoutMs);

			child.stdout?.on("data", (chunk: string | Buffer) => {
				stdout = truncateOutput(stdout + chunkToString(chunk));
			});
			child.stderr?.on("data", (chunk: string | Buffer) => {
				stderr = truncateOutput(stderr + chunkToString(chunk));
			});
			child.on("error", (error) => {
				clearTimeout(timeout);
				resolve({
					exitCode: null,
					signal: null,
					stdout,
					stderr: truncateOutput(`${stderr}${error.message}`),
					timedOut,
				});
			});
			child.on("close", (exitCode, signal) => {
				clearTimeout(timeout);
				resolve({
					exitCode,
					signal,
					stdout,
					stderr,
					timedOut,
				});
			});
		});
}

function expectedOutputMatches(
	expected: string | undefined,
	result: ValidatorCommandRunResult,
) {
	const normalizedExpected = expected?.trim();
	if (!normalizedExpected) {
		return true;
	}

	if (/^exit( code)? 0$/i.test(normalizedExpected)) {
		return result.exitCode === 0 && !result.timedOut;
	}

	return `${result.stdout}\n${result.stderr}`.includes(normalizedExpected);
}

function resolveValidatorCwd(runtime: RuntimeBindingSpec, defaultCwd: string) {
	return runtime.worktreePath?.trim() || defaultCwd;
}

function runsForGraph(runs: SelectTransitionRun[]) {
	return runs.map((run) => ({
		transitionId: run.transitionId,
		status: run.status,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
	}));
}

function isActiveTransitionRun(run: SelectTransitionRun) {
	return run.status === "pending" || run.status === "running";
}

export function createExecutionCircuitService(
	store: ExecutionCircuitStore,
	options: ExecutionCircuitServiceOptions = {},
) {
	const commandRunner =
		options.commandRunner ?? createNodeValidatorCommandRunner();
	const defaultCwd = options.defaultCwd ?? process.cwd();
	const getNow = options.now ?? Date.now;
	const validatorTimeoutMs =
		options.validatorTimeoutMs ?? defaultValidatorTimeoutMs;
	const allowedValidatorCommands = new Set(
		options.allowedValidatorCommands ?? defaultAllowedValidatorCommands,
	);

	function createRunForTransition(
		circuit: SelectExecutionCircuit,
		transitionId: string,
		input: Omit<CreateTransitionRunInput, "circuitId" | "transitionId"> = {},
	) {
		const transition = circuit.specJson.transitions.find(
			(candidate) => candidate.id === transitionId,
		);
		if (!transition) {
			throw new ExecutionCircuitServiceError(
				"NOT_FOUND",
				"Transition not found",
			);
		}

		assertWorkspaceBinding(store, input.workspaceId, transition.runtime);

		return store.insertTransitionRun({
			circuitId: circuit.id,
			transitionId: transition.id,
			status: "pending",
			workspaceId: input.workspaceId,
			agentRunId: input.agentRunId,
			runtimeSnapshotJson: transition.runtime,
			monadSnapshotJson: transition.monad,
		});
	}

	async function executeValidator(
		validator: ValidatorSpec,
		validatorIndex: number,
		transitionRuntime: RuntimeBindingSpec,
	): Promise<ValidatorExecutionRecord> {
		const startedAt = new Date(getNow()).toISOString();
		const baseRecord = {
			validatorIndex,
			kind: validator.kind,
			description: validator.description,
			required: validator.required,
			command: validator.command,
			startedAt,
			completedAt: startedAt,
		};

		if (!executableValidatorKinds.has(validator.kind)) {
			return {
				...baseRecord,
				status: "skipped",
				details: `${validator.kind} validators require manual or external evidence.`,
			};
		}

		if (!validator.command?.trim()) {
			return {
				...baseRecord,
				status: validator.required ? "failed" : "skipped",
				details: "Executable validator has no command.",
			};
		}

		if (
			!isAllowedValidatorCommand(validator.command, allowedValidatorCommands)
		) {
			return {
				...baseRecord,
				status: validator.required ? "failed" : "skipped",
				details:
					"Validator command is outside the automatic execution allowlist.",
			};
		}

		const cwd = resolveValidatorCwd(transitionRuntime, defaultCwd);
		const result = await commandRunner(validator.command, {
			cwd,
			timeoutMs: validatorTimeoutMs,
		});
		const completedAt = new Date(getNow()).toISOString();
		const passed =
			result.exitCode === 0 &&
			!result.timedOut &&
			expectedOutputMatches(validator.expected, result);

		return {
			...baseRecord,
			completedAt,
			status: passed ? "passed" : "failed",
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			details: result.timedOut
				? "Validator command timed out."
				: passed
					? "Validator command passed."
					: "Validator command failed or did not match expected output.",
		};
	}

	function buildValidationSummary(
		transitionRunId: string,
		records: ValidatorExecutionRecord[],
	): ValidatorExecutionSummary {
		const failedRequired = records.filter(
			(record) => record.required && record.status === "failed",
		);
		const passed = failedRequired.length === 0;
		const executedCount = records.filter(
			(record) => record.status !== "skipped",
		).length;

		return {
			transitionRunId,
			passed,
			records,
			details: passed
				? `Validator execution passed. Executed ${executedCount} validator(s), skipped ${
						records.length - executedCount
					}.`
				: `Required validator(s) failed: ${failedRequired
						.map((record) => record.description)
						.join(", ")}.`,
		};
	}

	return {
		getByTaskId(taskId: string): ExecutionCircuitWithRuns | null {
			const circuit = store.getLatestCircuitByTaskId(taskId);
			return circuit ? hydrateCircuit(store, circuit) : null;
		},

		createDraftForTask(taskId: string): ExecutionCircuitWithRuns {
			const existing = store.getLatestCircuitByTaskId(taskId);
			if (existing) {
				return hydrateCircuit(store, existing);
			}

			const task = assertTaskExists(store, taskId);

			const spec = createDraftExecutionCircuitForTask({
				taskId: task.id,
				title: task.title,
				description: task.description,
			});
			const validation = validateExecutionCircuitSpec(spec);
			const now = Date.now();
			const circuit = store.insertCircuit({
				id: spec.id,
				taskId: task.id,
				title: spec.title,
				status: spec.status,
				specJson: spec,
				validationJson: validation,
				createdAt: now,
				updatedAt: now,
			});

			return hydrateCircuit(store, circuit);
		},

		upsertSpec(taskId: string, inputSpec: unknown): ExecutionCircuitWithRuns {
			const { spec, validation } = parseAndValidateSpec(inputSpec);

			if (spec.taskId !== taskId) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"Spec taskId does not match request taskId",
				);
			}

			assertTaskExists(store, taskId);

			const now = Date.now();
			const nowIso = new Date(now).toISOString();
			const specToSave: ExecutionCircuitSpec = {
				...spec,
				updatedAt: nowIso,
				createdAt: spec.createdAt ?? nowIso,
			};
			const existing = store.getLatestCircuitByTaskId(taskId);

			if (existing) {
				const updated = store.updateCircuit(existing.id, {
					title: specToSave.title,
					status: specToSave.status,
					specJson: specToSave,
					validationJson: validation,
					updatedAt: now,
				});
				if (!updated) {
					throw new ExecutionCircuitServiceError(
						"NOT_FOUND",
						"Execution circuit not found",
					);
				}
				return hydrateCircuit(store, updated);
			}

			const inserted = store.insertCircuit({
				id: specToSave.id,
				taskId,
				title: specToSave.title,
				status: specToSave.status,
				specJson: specToSave,
				validationJson: validation,
				createdAt: now,
				updatedAt: now,
			});

			return hydrateCircuit(store, inserted);
		},

		validateSpec(spec: unknown) {
			return validateExecutionCircuitSpec(spec);
		},

		compileTransitionPrompt(circuitId: string, transitionId: string): string {
			const circuit = store.getCircuitById(circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}
			return compileTransitionPrompt(circuit.specJson, transitionId);
		},

		getTransitionGraph(circuitId: string): TransitionGraphPlan {
			const circuit = store.getCircuitById(circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}

			return planExecutionCircuitGraph(
				circuit.specJson,
				runsForGraph(store.listTransitionRuns(circuit.id)),
			);
		},

		exportSpec(circuitId: string): string {
			const circuit = store.getCircuitById(circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}
			return exportExecutionCircuitSpec(circuit.specJson);
		},

		importSpecForTask(
			taskId: string,
			serializedSpec: string,
		): ExecutionCircuitWithRuns {
			const imported = importExecutionCircuitSpec(serializedSpec);
			if (!imported.ok) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"Invalid execution circuit import",
					{ cause: imported.validation.errors },
				);
			}

			assertTaskExists(store, taskId);

			const now = getNow();
			const nowIso = new Date(now).toISOString();
			const importedSpec: ExecutionCircuitSpec = {
				...imported.spec,
				id:
					imported.spec.taskId === taskId
						? imported.spec.id
						: `execution-circuit-${taskId}`,
				taskId,
				createdAt: imported.spec.createdAt ?? nowIso,
				updatedAt: nowIso,
			};
			const { spec, validation } = parseAndValidateSpec(importedSpec);
			const existing = store.getLatestCircuitByTaskId(taskId);

			if (existing) {
				const updated = store.updateCircuit(existing.id, {
					title: spec.title,
					status: spec.status,
					specJson: spec,
					validationJson: validation,
					updatedAt: now,
				});
				if (!updated) {
					throw new ExecutionCircuitServiceError(
						"NOT_FOUND",
						"Execution circuit not found",
					);
				}
				return hydrateCircuit(store, updated);
			}

			const inserted = store.insertCircuit({
				id: spec.id,
				taskId,
				title: spec.title,
				status: spec.status,
				specJson: spec,
				validationJson: validation,
				createdAt: now,
				updatedAt: now,
			});

			return hydrateCircuit(store, inserted);
		},

		createTransitionRun(input: CreateTransitionRunInput): SelectTransitionRun {
			const circuit = store.getCircuitById(input.circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}

			return createRunForTransition(circuit, input.transitionId, input);
		},

		createNextTransitionRun(
			input: Omit<CreateTransitionRunInput, "transitionId">,
		): SelectTransitionRun {
			const circuit = store.getCircuitById(input.circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}

			const runs = store.listTransitionRuns(circuit.id);
			const graph = planExecutionCircuitGraph(
				circuit.specJson,
				runsForGraph(runs),
			);
			if (!graph.nextTransitionId) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"No runnable transition remains in this execution circuit",
				);
			}

			const activeRun = runs.find(
				(run) =>
					run.transitionId === graph.nextTransitionId &&
					isActiveTransitionRun(run),
			);
			if (activeRun) {
				return activeRun;
			}

			return createRunForTransition(circuit, graph.nextTransitionId, input);
		},

		appendTraceEvent(input: AppendTraceEventInput): SelectExperienceTraceEvent {
			const run = store.getTransitionRun(input.transitionRunId);
			if (!run) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition run not found",
				);
			}

			return store.insertTraceEvent({
				transitionRunId: input.transitionRunId,
				type: input.type,
				message: input.message,
				payloadJson: input.payload,
			});
		},

		completeTransitionRun(
			input: CompleteTransitionRunInput,
		): SelectTransitionRun {
			const run = store.getTransitionRun(input.transitionRunId);
			if (!run) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition run not found",
				);
			}

			const parsedOutput = transitionRunOutputSchema.safeParse(input.output);
			if (!parsedOutput.success) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"Transition output does not match the execution contract",
					{ cause: parsedOutput.error.flatten() },
				);
			}

			if (parsedOutput.data.transition_id !== run.transitionId) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"Transition output ID does not match transition run",
				);
			}

			if (
				parsedOutput.data.validation_result.passed !==
				input.validationResult.passed
			) {
				throw new ExecutionCircuitServiceError(
					"BAD_REQUEST",
					"Transition output validation result does not match stored validation result",
				);
			}

			const now = Date.now();
			const updated = store.updateTransitionRun(input.transitionRunId, {
				status: input.validationResult.passed ? "completed" : "failed",
				outputJson: parsedOutput.data,
				validationResultJson: input.validationResult,
				completedAt: now,
				updatedAt: now,
			});

			if (!updated) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition run not found",
				);
			}

			return updated;
		},

		async runValidatorsForTransitionRun(
			transitionRunId: string,
		): Promise<ValidatorExecutionSummary> {
			const run = store.getTransitionRun(transitionRunId);
			if (!run) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition run not found",
				);
			}

			const circuit = store.getCircuitById(run.circuitId);
			if (!circuit) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Execution circuit not found",
				);
			}

			const transition = circuit.specJson.transitions.find(
				(candidate) => candidate.id === run.transitionId,
			);
			if (!transition) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition not found",
				);
			}

			store.insertTraceEvent({
				transitionRunId,
				type: "validators.started",
				message: `Running ${transition.validators.length} validator(s).`,
				payloadJson: {
					transitionId: transition.id,
				},
			});

			const records: ValidatorExecutionRecord[] = [];
			for (const [index, validator] of transition.validators.entries()) {
				const record = await executeValidator(
					validator,
					index,
					transition.runtime,
				);
				records.push(record);
				store.insertTraceEvent({
					transitionRunId,
					type: `validator.${record.status}`,
					message: `${record.kind}: ${record.description}`,
					payloadJson: {
						validator: record,
					},
				});
			}

			const summary = buildValidationSummary(transitionRunId, records);
			const now = getNow();
			const updated = store.updateTransitionRun(transitionRunId, {
				status: summary.passed ? run.status : "failed",
				validationResultJson: {
					passed: summary.passed,
					details: summary.details,
				},
				completedAt: summary.passed ? run.completedAt : now,
				updatedAt: now,
			});

			if (!updated) {
				throw new ExecutionCircuitServiceError(
					"NOT_FOUND",
					"Transition run not found",
				);
			}

			store.insertTraceEvent({
				transitionRunId,
				type: summary.passed ? "validators.passed" : "validators.failed",
				message: summary.details,
				payloadJson: {
					summary,
				},
			});

			return summary;
		},
	};
}
