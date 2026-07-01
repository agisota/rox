import { z } from "zod";

export const fusionTaskColumns = [
	"triage",
	"todo",
	"in-progress",
	"in-review",
	"done",
	"archived",
] as const;

export const fusionTaskColumnSchema = z.enum(fusionTaskColumns);
export type FusionTaskColumn = z.infer<typeof fusionTaskColumnSchema>;

export const fusionStepStatuses = [
	"pending",
	"in-progress",
	"done",
	"skipped",
] as const;

export const fusionStepStatusSchema = z.enum(fusionStepStatuses);
export type FusionStepStatus = z.infer<typeof fusionStepStatusSchema>;

export const fusionNodeTypes = ["local", "remote"] as const;
export const fusionNodeTypeSchema = z.enum(fusionNodeTypes);
export type FusionNodeType = z.infer<typeof fusionNodeTypeSchema>;

const unknownRecordSchema = z.record(z.string(), z.unknown());

export const fusionTaskStepSchema = z
	.object({
		name: z.string().optional(),
		description: z.string().optional(),
		status: fusionStepStatusSchema.optional(),
	})
	.catchall(z.unknown());

export type FusionTaskStep = z.infer<typeof fusionTaskStepSchema>;

export const fusionTaskLogEntrySchema = z
	.object({
		type: z.string().optional(),
		message: z.string().optional(),
		timestamp: z.string().optional(),
	})
	.catchall(z.unknown());

export type FusionTaskLogEntry = z.infer<typeof fusionTaskLogEntrySchema>;

export const fusionTaskSchema = z.object({
	id: z.string().min(1),
	lineageId: z.string().nullable().optional(),
	title: z.string().nullable().optional(),
	description: z.string(),
	priority: z.string().nullable().optional(),
	column: fusionTaskColumnSchema,
	status: z.string().nullable().optional(),
	size: z.string().nullable().optional(),
	currentStep: z.number().int().nonnegative().default(0),
	worktree: z.string().nullable().optional(),
	blockedBy: z.string().nullable().optional(),
	paused: z.boolean().default(false),
	userPaused: z.boolean().default(false),
	branch: z.string().nullable().optional(),
	prInfo: unknownRecordSchema.nullable().optional(),
	dependencies: z.array(z.string()).default([]),
	steps: z.array(fusionTaskStepSchema).default([]),
	log: z.array(fusionTaskLogEntrySchema).default([]),
	attachments: z.array(unknownRecordSchema).default([]),
	comments: z.array(unknownRecordSchema).default([]),
	steeringComments: z.array(unknownRecordSchema).default([]),
	workflowStepResults: z.array(unknownRecordSchema).default([]),
	nodeId: z.string().nullable().optional(),
	effectiveNodeId: z.string().nullable().optional(),
	effectiveNodeSource: z.string().nullable().optional(),
	assignedAgentId: z.string().nullable().optional(),
	checkedOutBy: z.string().nullable().optional(),
	checkoutNodeId: z.string().nullable().optional(),
	checkoutRunId: z.string().nullable().optional(),
	sourceType: z.string().nullable().optional(),
	sourceAgentId: z.string().nullable().optional(),
	sourceRunId: z.string().nullable().optional(),
	sourceSessionId: z.string().nullable().optional(),
	sourceMessageId: z.string().nullable().optional(),
	sourceParentTaskId: z.string().nullable().optional(),
	sourceMetadata: unknownRecordSchema.nullable().optional(),
	customFields: unknownRecordSchema.default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
	deletedAt: z.string().nullable().optional(),
});

export type FusionTask = z.infer<typeof fusionTaskSchema>;

export const fusionProjectSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	path: z.string().min(1),
	status: z.string(),
	isolationMode: z.string(),
	nodeId: z.string().nullable().optional(),
	settings: unknownRecordSchema.nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	lastActivityAt: z.string().nullable().optional(),
});

export type FusionProject = z.infer<typeof fusionProjectSchema>;

export const fusionNodeSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	type: fusionNodeTypeSchema,
	url: z.string().nullable().optional(),
	status: z.string(),
	maxConcurrent: z.number().int().positive(),
	capabilities: unknownRecordSchema.nullable().optional(),
	systemMetrics: unknownRecordSchema.nullable().optional(),
	versionInfo: unknownRecordSchema.nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type FusionNode = z.infer<typeof fusionNodeSchema>;

export const fusionAgentSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	role: z.string(),
	state: z.string(),
	taskId: z.string().nullable().optional(),
	metadata: unknownRecordSchema.default({}),
	data: unknownRecordSchema.default({}),
	createdAt: z.string(),
	updatedAt: z.string(),
	lastHeartbeatAt: z.string().nullable().optional(),
});

export type FusionAgent = z.infer<typeof fusionAgentSchema>;

export const fusionAgentRunSchema = z.object({
	id: z.string().min(1),
	agentId: z.string().min(1),
	data: unknownRecordSchema,
	startedAt: z.string(),
	endedAt: z.string().nullable().optional(),
	status: z.string(),
});

export type FusionAgentRun = z.infer<typeof fusionAgentRunSchema>;

export const fusionWorkflowSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	ir: unknownRecordSchema,
	layout: unknownRecordSchema,
	kind: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type FusionWorkflow = z.infer<typeof fusionWorkflowSchema>;

export type FusionSqlValue = string | number | bigint | boolean | null;
export type FusionSqlRow = Record<string, FusionSqlValue>;

function boolFromSql(value: FusionSqlValue | undefined, defaultValue = false) {
	if (value == null) return defaultValue;
	if (typeof value === "boolean") return value;
	if (typeof value === "number" || typeof value === "bigint")
		return Number(value) !== 0;
	if (typeof value === "string")
		return value === "1" || value.toLowerCase() === "true";
	return defaultValue;
}

function numberFromSql(value: FusionSqlValue | undefined, defaultValue = 0) {
	if (typeof value === "number") return value;
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	}
	return defaultValue;
}

function stringFromSql(value: FusionSqlValue | undefined): string | undefined {
	if (value == null) return undefined;
	return String(value);
}

function nullableStringFromSql(
	value: FusionSqlValue | undefined,
): string | null | undefined {
	if (value == null) return undefined;
	const str = String(value);
	return str.length > 0 ? str : null;
}

function parseJson(value: FusionSqlValue | undefined): unknown {
	if (value == null) return undefined;
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (trimmed === "") return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

function parseJsonArray(value: FusionSqlValue | undefined): unknown[] {
	const parsed = parseJson(value);
	return Array.isArray(parsed) ? parsed : [];
}

function parseJsonRecord(
	value: FusionSqlValue | undefined,
): Record<string, unknown> | undefined {
	const parsed = parseJson(value);
	if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}
	return undefined;
}

function requiredString(row: FusionSqlRow, key: string): string {
	const value = stringFromSql(row[key]);
	if (!value) throw new Error(`Fusion row is missing required "${key}"`);
	return value;
}

export function parseFusionTaskRow(row: FusionSqlRow): FusionTask {
	return fusionTaskSchema.parse({
		id: requiredString(row, "id"),
		lineageId: nullableStringFromSql(row.lineageId),
		title: nullableStringFromSql(row.title),
		description: requiredString(row, "description"),
		priority: nullableStringFromSql(row.priority),
		column: requiredString(row, "column"),
		status: nullableStringFromSql(row.status),
		size: nullableStringFromSql(row.size),
		currentStep: numberFromSql(row.currentStep),
		worktree: nullableStringFromSql(row.worktree),
		blockedBy: nullableStringFromSql(row.blockedBy),
		paused: boolFromSql(row.paused),
		userPaused: boolFromSql(row.userPaused),
		branch: nullableStringFromSql(row.branch),
		prInfo: parseJsonRecord(row.prInfo) ?? null,
		dependencies: parseJsonArray(row.dependencies),
		steps: parseJsonArray(row.steps),
		log: parseJsonArray(row.log),
		attachments: parseJsonArray(row.attachments),
		comments: parseJsonArray(row.comments),
		steeringComments: parseJsonArray(row.steeringComments),
		workflowStepResults: parseJsonArray(row.workflowStepResults),
		nodeId: nullableStringFromSql(row.nodeId),
		effectiveNodeId: nullableStringFromSql(row.effectiveNodeId),
		effectiveNodeSource: nullableStringFromSql(row.effectiveNodeSource),
		assignedAgentId: nullableStringFromSql(row.assignedAgentId),
		checkedOutBy: nullableStringFromSql(row.checkedOutBy),
		checkoutNodeId: nullableStringFromSql(row.checkoutNodeId),
		checkoutRunId: nullableStringFromSql(row.checkoutRunId),
		sourceType: nullableStringFromSql(row.sourceType),
		sourceAgentId: nullableStringFromSql(row.sourceAgentId),
		sourceRunId: nullableStringFromSql(row.sourceRunId),
		sourceSessionId: nullableStringFromSql(row.sourceSessionId),
		sourceMessageId: nullableStringFromSql(row.sourceMessageId),
		sourceParentTaskId: nullableStringFromSql(row.sourceParentTaskId),
		sourceMetadata: parseJsonRecord(row.sourceMetadata) ?? null,
		customFields: parseJsonRecord(row.customFields) ?? {},
		createdAt: requiredString(row, "createdAt"),
		updatedAt: requiredString(row, "updatedAt"),
		deletedAt: nullableStringFromSql(row.deletedAt),
	});
}

export function parseFusionProjectRow(row: FusionSqlRow): FusionProject {
	return fusionProjectSchema.parse({
		id: requiredString(row, "id"),
		name: requiredString(row, "name"),
		path: requiredString(row, "path"),
		status: requiredString(row, "status"),
		isolationMode: requiredString(row, "isolationMode"),
		nodeId: nullableStringFromSql(row.nodeId),
		settings: parseJsonRecord(row.settings) ?? null,
		createdAt: requiredString(row, "createdAt"),
		updatedAt: requiredString(row, "updatedAt"),
		lastActivityAt: nullableStringFromSql(row.lastActivityAt),
	});
}

export function parseFusionNodeRow(row: FusionSqlRow): FusionNode {
	return fusionNodeSchema.parse({
		id: requiredString(row, "id"),
		name: requiredString(row, "name"),
		type: requiredString(row, "type"),
		url: nullableStringFromSql(row.url),
		status: requiredString(row, "status"),
		maxConcurrent: numberFromSql(row.maxConcurrent, 1),
		capabilities: parseJsonRecord(row.capabilities) ?? null,
		systemMetrics: parseJsonRecord(row.systemMetrics) ?? null,
		versionInfo: parseJsonRecord(row.versionInfo) ?? null,
		createdAt: requiredString(row, "createdAt"),
		updatedAt: requiredString(row, "updatedAt"),
	});
}
