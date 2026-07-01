import type {
	FusionAgentRun,
	FusionNode,
	FusionProject,
	FusionStepStatus,
	FusionTask,
	FusionTaskColumn,
	FusionTaskStep,
} from "./fusionTypes";

export type RoxTaskStatus =
	| "backlog"
	| "todo"
	| "planning"
	| "working"
	| "needs-feedback"
	| "ready-to-merge"
	| "completed"
	| "canceled";

export type RoxWorkflowRunStatus =
	| "queued"
	| "running"
	| "waiting_approval"
	| "succeeded"
	| "failed"
	| "canceled"
	| "timeout";

export type RoxWorkflowStepStatus =
	| "pending"
	| "running"
	| "succeeded"
	| "failed"
	| "skipped"
	| "waiting_approval"
	| "canceled";

export interface RoxFusionTaskMirror {
	source: "fusion";
	sourceTaskId: string;
	sourceLineageId?: string;
	title: string;
	description: string;
	status: RoxTaskStatus;
	branch?: string;
	prUrl?: string;
	labels: string[];
	provenance: {
		column: FusionTaskColumn;
		nodeId?: string;
		effectiveNodeId?: string;
		assignedAgentId?: string;
		checkoutRunId?: string;
		sourceType?: string;
		sourceRunId?: string;
		updatedAt: string;
	};
}

export interface RoxFusionRunMirror {
	source: "fusion";
	sourceRunId: string;
	sourceAgentId: string;
	status: RoxWorkflowRunStatus;
	startedAt: string;
	endedAt?: string;
	output?: Record<string, unknown>;
}

export interface RoxFusionStepMirror {
	blockId: string;
	blockType: "fusion_task_step";
	blockName?: string;
	status: RoxWorkflowStepStatus;
	output?: Record<string, unknown>;
}

export interface RoxFusionAgentSourceDraft {
	kind: "external_http";
	slug: "fusion";
	name: "Fusion";
	description: string;
	endpointUrl: string | null;
	config: {
		provider: "fusion";
		mode: "sidecar";
		cliCommand: "fn";
		projectDbPath: string;
		centralDbPath: string;
		project?: Pick<FusionProject, "id" | "name" | "path">;
		node?: Pick<FusionNode, "id" | "name" | "type" | "status">;
	};
	capabilities: string[];
	version?: string;
}

const columnToRoxStatus: Record<FusionTaskColumn, RoxTaskStatus> = {
	triage: "backlog",
	todo: "todo",
	"in-progress": "working",
	"in-review": "ready-to-merge",
	done: "completed",
	archived: "canceled",
};

export function mapFusionColumnToRoxTaskStatus(
	column: FusionTaskColumn,
): RoxTaskStatus {
	return columnToRoxStatus[column];
}

export function mapFusionStepStatusToRoxStepStatus(
	status: FusionStepStatus | undefined,
): RoxWorkflowStepStatus {
	switch (status) {
		case "done":
			return "succeeded";
		case "in-progress":
			return "running";
		case "skipped":
			return "skipped";
		case "pending":
		case undefined:
			return "pending";
	}
}

export function mapFusionRunStatusToRoxRunStatus(
	status: string,
): RoxWorkflowRunStatus {
	const normalized = status.toLowerCase().replaceAll("_", "-");
	if (normalized === "queued" || normalized === "pending") return "queued";
	if (normalized === "running" || normalized === "in-progress")
		return "running";
	if (
		normalized === "succeeded" ||
		normalized === "success" ||
		normalized === "done"
	) {
		return "succeeded";
	}
	if (normalized === "failed" || normalized === "error") return "failed";
	if (
		normalized === "canceled" ||
		normalized === "cancelled" ||
		normalized === "archived"
	) {
		return "canceled";
	}
	if (normalized === "timeout" || normalized === "timed-out") return "timeout";
	return "running";
}

function prUrlFromFusionTask(task: FusionTask): string | undefined {
	const prInfo = task.prInfo;
	if (!prInfo) return undefined;
	const url = prInfo.url;
	return typeof url === "string" && url.length > 0 ? url : undefined;
}

function compactStrings(values: Array<string | null | undefined>): string[] {
	return values.filter((value): value is string => Boolean(value));
}

export function toRoxFusionTaskMirror(task: FusionTask): RoxFusionTaskMirror {
	return {
		source: "fusion",
		sourceTaskId: task.id,
		...(task.lineageId ? { sourceLineageId: task.lineageId } : {}),
		title: task.title?.trim() || task.description.slice(0, 80),
		description: task.description,
		status: mapFusionColumnToRoxTaskStatus(task.column),
		...(task.branch ? { branch: task.branch } : {}),
		...(prUrlFromFusionTask(task) ? { prUrl: prUrlFromFusionTask(task) } : {}),
		labels: compactStrings([
			"fusion",
			task.priority ? `priority:${task.priority}` : undefined,
			task.size ? `size:${task.size}` : undefined,
			task.paused ? "paused" : undefined,
		]),
		provenance: {
			column: task.column,
			...(task.nodeId ? { nodeId: task.nodeId } : {}),
			...(task.effectiveNodeId
				? { effectiveNodeId: task.effectiveNodeId }
				: {}),
			...(task.assignedAgentId
				? { assignedAgentId: task.assignedAgentId }
				: {}),
			...(task.checkoutRunId ? { checkoutRunId: task.checkoutRunId } : {}),
			...(task.sourceType ? { sourceType: task.sourceType } : {}),
			...(task.sourceRunId ? { sourceRunId: task.sourceRunId } : {}),
			updatedAt: task.updatedAt,
		},
	};
}

export function toRoxFusionStepMirrors(
	task: FusionTask,
): RoxFusionStepMirror[] {
	return task.steps.map((step: FusionTaskStep, index) => ({
		blockId: `fusion-step-${index}`,
		blockType: "fusion_task_step",
		...(step.name ? { blockName: step.name } : {}),
		status: mapFusionStepStatusToRoxStepStatus(step.status),
		output: {
			index,
			...(step.description ? { description: step.description } : {}),
		},
	}));
}

export function toRoxFusionRunMirror(run: FusionAgentRun): RoxFusionRunMirror {
	return {
		source: "fusion",
		sourceRunId: run.id,
		sourceAgentId: run.agentId,
		status: mapFusionRunStatusToRoxRunStatus(run.status),
		startedAt: run.startedAt,
		...(run.endedAt ? { endedAt: run.endedAt } : {}),
		output: run.data,
	};
}

export function buildFusionAgentSourceDraft(args: {
	endpointUrl?: string | null;
	projectDbPath?: string;
	centralDbPath?: string;
	project?: FusionProject;
	node?: FusionNode;
	version?: string;
}): RoxFusionAgentSourceDraft {
	return {
		kind: "external_http",
		slug: "fusion",
		name: "Fusion",
		description:
			"Local Fusion sidecar for async task-board execution, mesh nodes, and task-run mirroring.",
		endpointUrl: args.endpointUrl ?? null,
		config: {
			provider: "fusion",
			mode: "sidecar",
			cliCommand: "fn",
			projectDbPath: args.projectDbPath ?? "~/.fusion/fusion.db",
			centralDbPath: args.centralDbPath ?? "~/.fusion/fusion-central.db",
			...(args.project
				? {
						project: {
							id: args.project.id,
							name: args.project.name,
							path: args.project.path,
						},
					}
				: {}),
			...(args.node
				? {
						node: {
							id: args.node.id,
							name: args.node.name,
							type: args.node.type,
							status: args.node.status,
						},
					}
				: {}),
		},
		capabilities: [
			"task-board",
			"async-agent-run",
			"mesh-node",
			"workflow-mirror",
			"approval-gate",
		],
		...(args.version ? { version: args.version } : {}),
	};
}
