export * from "./graph-runner";
export * from "./import-export";
export * from "./monad-completeness";
export * from "./prompt-compiler";
export * from "./schemas";
export * from "./validate";

import type { ExecutionCircuitSpec } from "./schemas";

export type DraftExecutionCircuitTask = {
	taskId: string;
	title: string;
	description?: string | null;
	workspaceId?: string | null;
	projectId?: string | null;
	now?: string;
};

export function createDraftExecutionCircuitForTask(
	task: DraftExecutionCircuitTask,
): ExecutionCircuitSpec {
	const now = task.now ?? new Date().toISOString();
	const hasWorkspace = Boolean(task.workspaceId);
	const targetDescription =
		task.description?.trim() || `Complete task: ${task.title}`;

	return {
		version: 1,
		id: `execution-circuit-${task.taskId}`,
		taskId: task.taskId,
		title: `Execution Circuit: ${task.title}`,
		status: "draft",
		currentState: {
			id: "current-task-state",
			name: "Current task state",
			description:
				"Task exists but its required state transition has not been specified yet.",
			assertions: ["The task has been captured in Superset."],
			evidenceRefs: [task.taskId],
		},
		targetState: {
			id: "verified-task-completion",
			name: "Verified task completion",
			description: targetDescription,
			assertions: [
				"The requested change is implemented or the task is explicitly marked blocked.",
				"Relevant validation evidence is attached.",
			],
		},
		intermediateStates: [],
		transitions: [
			{
				id: "define-and-execute-task-transition",
				name: "Define and execute task transition",
				description:
					"Specify the concrete target state, execute the smallest safe implementation path, and attach validation evidence.",
				fromStateId: "current-task-state",
				toStateId: "verified-task-completion",
				requiredEvents: [
					{
						id: "inspect-task-context",
						name: "Inspect task context",
						description:
							"Read the task title, description, linked project context, and relevant repo files.",
						required: true,
						evidenceHint: "List the files, notes, and task records inspected.",
					},
					{
						id: "identify-target-state",
						name: "Identify concrete target state",
						description:
							"Convert the task request into assertions that can be validated.",
						required: true,
						evidenceHint: "Record the final state assertions used.",
					},
					{
						id: "execute-minimal-implementation",
						name: "Execute minimal implementation",
						description:
							"Make the smallest reversible change that moves the task toward the target state.",
						required: true,
						evidenceHint: "List changed files and why each change was needed.",
					},
					{
						id: "run-relevant-validation",
						name: "Run relevant validation",
						description:
							"Run tests, lint, typecheck, or manual checks that prove the target state.",
						required: true,
						evidenceHint: "Attach command outputs or manual review notes.",
					},
					{
						id: "produce-trace-summary",
						name: "Produce trace summary",
						description:
							"Summarize what happened, what was validated, and what remains risky.",
						required: true,
						evidenceHint: "Return the structured final response.",
					},
				],
				runtime: {
					kind: hasWorkspace ? "workspace" : "unspecified",
					workspaceId: task.workspaceId ?? undefined,
					projectId: task.projectId ?? undefined,
					notes: hasWorkspace
						? undefined
						: "No workspace was attached when the draft was created.",
				},
				monad: {
					contextRefs: [
						`task:${task.taskId}`,
						`task.title:${task.title}`,
						...(task.description
							? [`task.description:${task.description}`]
							: []),
					],
					tools: ["repo search", "file read", "file edit", "test runner"],
					permissions: [
						"read project files",
						"edit scoped files",
						"run local checks",
					],
					constraints: [
						"Keep the diff scoped.",
						"Follow repo conventions.",
						"Run tests, lint, and typecheck relevant to touched code.",
					],
					memoryRefs: ["AGENTS.md", "task context"],
					qualityCriteria: [
						"The target state assertions are satisfied or the task is explicitly blocked.",
						"Validation evidence is attached.",
						"Remaining risks are documented.",
					],
				},
				outputContract: {
					format: "json",
					requiredFields: [
						"transition_id",
						"status",
						"events_observed",
						"files_changed",
						"commands_run",
						"artifacts_produced",
						"validation_result",
						"remaining_risks",
						"next_recommended_transition",
					],
				},
				validators: [
					{
						kind: "manual",
						description:
							"Human review confirms the transition evidence matches the target state.",
						expected:
							"Reviewed evidence supports completed, blocked, or failed status.",
						required: true,
					},
				],
			},
		],
		createdAt: now,
		updatedAt: now,
	};
}
