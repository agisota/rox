import type { FusionTask } from "./fusionTypes";
import { parseFusionTaskRow } from "./fusionTypes";
import type { RoxFusionStepMirror, RoxFusionTaskMirror } from "./roxMapping";
import { toRoxFusionStepMirrors, toRoxFusionTaskMirror } from "./roxMapping";

export interface FusionSqliteRunResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
}

export interface FusionSqliteRunOptions {
	command?: "sqlite3";
	timeoutMs?: number;
	cwd?: string;
	env?: Record<string, string | undefined>;
}

export interface FusionTaskListOptions {
	limit?: number;
	includeArchived?: boolean;
}

export interface RoxFusionTaskMirrorEntry {
	task: RoxFusionTaskMirror;
	steps: RoxFusionStepMirror[];
}

const DEFAULT_TASK_LIMIT = 50;
const MAX_TASK_LIMIT = 200;

const taskColumns = [
	"id",
	"lineageId",
	"title",
	"description",
	"priority",
	'"column"',
	"status",
	"size",
	"currentStep",
	"worktree",
	"blockedBy",
	"paused",
	"userPaused",
	"branch",
	"prInfo",
	"dependencies",
	"steps",
	"attachments",
	"comments",
	"steeringComments",
	"workflowStepResults",
	"nodeId",
	"effectiveNodeId",
	"effectiveNodeSource",
	"assignedAgentId",
	"checkedOutBy",
	"checkoutNodeId",
	"checkoutRunId",
	"sourceType",
	"sourceAgentId",
	"sourceRunId",
	"sourceSessionId",
	"sourceMessageId",
	"sourceParentTaskId",
	"sourceMetadata",
	"customFields",
	"createdAt",
	"updatedAt",
	"deletedAt",
];

function clampLimit(limit: number | undefined): number {
	if (limit === undefined) return DEFAULT_TASK_LIMIT;
	if (!Number.isFinite(limit)) return DEFAULT_TASK_LIMIT;
	return Math.min(Math.max(Math.trunc(limit), 1), MAX_TASK_LIMIT);
}

export function buildFusionTaskListSql(
	options: FusionTaskListOptions = {},
): string {
	const limit = clampLimit(options.limit);
	const archivedClause = options.includeArchived
		? ""
		: " and \"column\" != 'archived'";
	return `select ${taskColumns.join(
		",",
	)} from tasks where deletedAt is null${archivedClause} order by updatedAt desc limit ${limit};`;
}

export function parseFusionTaskListJsonOutput(output: string): FusionTask[] {
	const trimmed = output.trim();
	if (trimmed.length === 0) return [];
	const parsed = JSON.parse(trimmed);
	if (!Array.isArray(parsed)) {
		throw new Error("Fusion sqlite task output was not a JSON array");
	}
	return parsed.map((row) => parseFusionTaskRow(row));
}

export function toRoxFusionTaskMirrorEntries(
	tasks: FusionTask[],
): RoxFusionTaskMirrorEntry[] {
	return tasks.map((task) => ({
		task: toRoxFusionTaskMirror(task),
		steps: toRoxFusionStepMirrors(task),
	}));
}

export async function runFusionSqliteJson(
	dbPath: string,
	sql: string,
	options: FusionSqliteRunOptions = {},
): Promise<FusionSqliteRunResult> {
	const command = options.command ?? "sqlite3";
	let timedOut = false;
	const proc = Bun.spawn([command, "-readonly", "-json", dbPath, sql], {
		cwd: options.cwd,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout =
		options.timeoutMs === undefined
			? undefined
			: setTimeout(() => {
					timedOut = true;
					proc.kill("SIGTERM");
				}, options.timeoutMs);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (timeout) clearTimeout(timeout);
	return { stdout, stderr, exitCode, timedOut };
}

export async function listFusionTasksFromSqlite(
	dbPath: string,
	options: FusionTaskListOptions & FusionSqliteRunOptions = {},
): Promise<FusionTask[]> {
	const result = await runFusionSqliteJson(
		dbPath,
		buildFusionTaskListSql(options),
		options,
	);
	if (result.exitCode !== 0 || result.timedOut) {
		throw new Error(
			`Fusion sqlite task list failed (${result.exitCode}): ${result.stderr || result.stdout}`,
		);
	}
	return parseFusionTaskListJsonOutput(result.stdout);
}
