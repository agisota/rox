export interface FusionTableErd {
	database: "project" | "central" | "archive";
	table: string;
	primaryKey: string | string[];
	relations: string[];
	roxMapping: string;
	indexAssumption: string;
}

export const fusionErd: FusionTableErd[] = [
	{
		database: "project",
		table: "tasks",
		primaryKey: "id",
		relations: [
			"tasks.id -> task_documents.taskId",
			"tasks.id -> artifacts.taskId",
			"tasks.id -> workflow_work_items.taskId",
			"tasks.nodeId/effectiveNodeId -> central.nodes.id",
		],
		roxMapping:
			"Mirror into Rox task/workflow provenance; do not make authoritative.",
		indexAssumption:
			"Fusion indexes column, createdAt, updatedAt DESC, assignedAgentId, deletedAt.",
	},
	{
		database: "project",
		table: "agentRuns",
		primaryKey: "id",
		relations: ["agentRuns.agentId -> agents.id"],
		roxMapping:
			"Mirror into workflow_runs triggerRef/output when a Fusion run is observed.",
		indexAssumption: "Fusion indexes (agentId, startedAt) and status.",
	},
	{
		database: "project",
		table: "agents",
		primaryKey: "id",
		relations: ["agents.taskId -> tasks.id"],
		roxMapping: "Map to Rox agent source/runtime presence metadata.",
		indexAssumption: "Fusion indexes state.",
	},
	{
		database: "project",
		table: "workflow_run_step_instances",
		primaryKey: ["taskId", "runId", "foreachNodeId", "stepIndex"],
		relations: ["workflow_run_step_instances.taskId -> tasks.id"],
		roxMapping:
			"Map to workflow_run_steps only as execution evidence, not graph definition.",
		indexAssumption: "Fusion indexes (taskId, runId).",
	},
	{
		database: "project",
		table: "workflows",
		primaryKey: "id",
		relations: ["workflow_settings.workflowId -> workflows.id"],
		roxMapping:
			"Import only through explicit converter; Rox workflow_definitions stay canonical.",
		indexAssumption: "Fusion indexes createdAt.",
	},
	{
		database: "central",
		table: "projects",
		primaryKey: "id",
		relations: [
			"projects.id -> projectNodePathMappings.projectId",
			"projects.id -> taskClaims.projectId",
		],
		roxMapping: "Map to host-service project/workspace discovery by repo path.",
		indexAssumption: "Fusion enforces unique path and indexes status.",
	},
	{
		database: "central",
		table: "nodes",
		primaryKey: "id",
		relations: [
			"nodes.id -> projectNodePathMappings.nodeId",
			"nodes.id -> taskClaims.ownerNodeId",
			"nodes.id -> managedDockerNodes.nodeId",
		],
		roxMapping: "Map to runtime_services/host_presence style health metadata.",
		indexAssumption: "Fusion indexes status and type.",
	},
	{
		database: "central",
		table: "taskClaims",
		primaryKey: ["projectId", "taskId"],
		relations: [
			"taskClaims.projectId -> projects.id",
			"taskClaims.ownerNodeId -> nodes.id",
		],
		roxMapping: "Map to agent_run_coord-like lease state.",
		indexAssumption: "Fusion indexes ownerNodeId.",
	},
];

export function fusionErdByTable(table: string): FusionTableErd | undefined {
	return fusionErd.find((entry) => entry.table === table);
}
