import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	buildFusionAgentSourceDraft,
	FusionCliClient,
	type FusionNode,
	type FusionProject,
	listFusionTasksFromSqlite,
	type RoxFusionAgentSourceDraft,
	type RoxFusionTaskMirrorEntry,
	toRoxFusionTaskMirrorEntries,
} from "@rox/fusion-adapter";
import { z } from "zod";
import { queryProcedure, router } from "../../index";

const FUSION_CLI_TIMEOUT_MS = 3_000;
const FUSION_SQLITE_TIMEOUT_MS = 3_000;
const FUSION_STATUS_TIMEOUT_MS = 12_000;
const FUSION_TASKS_TIMEOUT_MS = 12_000;

export interface FusionFileStatus {
	path: string;
	exists: boolean;
}

export interface FusionCliStatus {
	command: "fn";
	available: boolean;
	version: string | null;
	error: string | null;
}

export interface FusionStatusResult {
	available: boolean;
	cli: FusionCliStatus;
	databases: {
		project: FusionFileStatus;
		central: FusionFileStatus;
		archive: FusionFileStatus;
	};
	project: FusionProject | null;
	node: FusionNode | null;
	agentSourceDraft: RoxFusionAgentSourceDraft | null;
	errors: string[];
}

export interface FusionTaskMirrorResult {
	available: boolean;
	status: FusionStatusResult;
	tasks: RoxFusionTaskMirrorEntry[];
	truncated: boolean;
	errors: string[];
}

const statusInputSchema = z
	.object({
		projectPath: z.string().trim().min(1).optional(),
		dashboardUrl: z.string().trim().min(1).optional(),
	})
	.optional();

const tasksInputSchema = z
	.object({
		projectPath: z.string().trim().min(1).optional(),
		dashboardUrl: z.string().trim().min(1).optional(),
		limit: z.number().int().min(1).max(200).default(50),
		includeArchived: z.boolean().default(false),
	})
	.optional();

export function fusionDatabasePaths(home = homedir()) {
	const fusionHome = join(home, ".fusion");
	return {
		project: join(fusionHome, "fusion.db"),
		central: join(fusionHome, "fusion-central.db"),
		archive: join(fusionHome, "archive.db"),
	};
}

async function fileStatus(path: string): Promise<FusionFileStatus> {
	try {
		await access(path);
		return { path, exists: true };
	} catch {
		return { path, exists: false };
	}
}

export function selectFusionProject(
	projects: FusionProject[],
	projectPath: string | undefined,
): FusionProject | null {
	if (projects.length === 0) return null;
	if (!projectPath) return projects[0] ?? null;
	const normalized = resolve(projectPath);
	return (
		projects.find((project) => resolve(project.path) === normalized) ??
		projects.find((project) =>
			normalized.startsWith(`${resolve(project.path)}/`),
		) ??
		projects[0] ??
		null
	);
}

export function selectFusionNode(nodes: FusionNode[]): FusionNode | null {
	return (
		nodes.find((node) => node.status === "online" && node.type === "local") ??
		nodes.find((node) => node.status === "online") ??
		nodes[0] ??
		null
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function getCliStatus(client: FusionCliClient): Promise<FusionCliStatus> {
	try {
		const version = await client.version();
		return {
			command: "fn",
			available: true,
			version,
			error: null,
		};
	} catch (error) {
		return {
			command: "fn",
			available: false,
			version: null,
			error: errorMessage(error),
		};
	}
}

export async function discoverFusionStatus(args: {
	projectPath?: string;
	dashboardUrl?: string;
	home?: string;
	client?: FusionCliClient;
}): Promise<FusionStatusResult> {
	const paths = fusionDatabasePaths(args.home);
	const client =
		args.client ?? new FusionCliClient({ timeoutMs: FUSION_CLI_TIMEOUT_MS });
	const [projectDb, centralDb, archiveDb, cli] = await Promise.all([
		fileStatus(paths.project),
		fileStatus(paths.central),
		fileStatus(paths.archive),
		getCliStatus(client),
	]);

	const errors: string[] = [];
	const projects: FusionProject[] = [];
	const nodes: FusionNode[] = [];

	if (cli.available) {
		try {
			projects.push(...(await client.listProjects()));
		} catch (error) {
			errors.push(`project list: ${errorMessage(error)}`);
		}
		try {
			nodes.push(...(await client.listNodes()));
		} catch (error) {
			errors.push(`node list: ${errorMessage(error)}`);
		}
	} else if (cli.error) {
		errors.push(`cli: ${cli.error}`);
	}

	const project = selectFusionProject(projects, args.projectPath);
	const node = selectFusionNode(nodes);
	const canBuildDraft = cli.available && projectDb.exists && centralDb.exists;
	const agentSourceDraft = canBuildDraft
		? buildFusionAgentSourceDraft({
				endpointUrl: args.dashboardUrl ?? "http://127.0.0.1:4040",
				projectDbPath: projectDb.path,
				centralDbPath: centralDb.path,
				...(project ? { project } : {}),
				...(node ? { node } : {}),
				...(cli.version ? { version: cli.version } : {}),
			})
		: null;

	return {
		available: Boolean(agentSourceDraft),
		cli,
		databases: {
			project: projectDb,
			central: centralDb,
			archive: archiveDb,
		},
		project,
		node,
		agentSourceDraft,
		errors,
	};
}

export async function discoverFusionTaskMirrors(args: {
	projectPath?: string;
	dashboardUrl?: string;
	home?: string;
	client?: FusionCliClient;
	limit?: number;
	includeArchived?: boolean;
	listTasks?: typeof listFusionTasksFromSqlite;
}): Promise<FusionTaskMirrorResult> {
	const status = await discoverFusionStatus({
		...(args.projectPath ? { projectPath: args.projectPath } : {}),
		...(args.dashboardUrl ? { dashboardUrl: args.dashboardUrl } : {}),
		...(args.home ? { home: args.home } : {}),
		...(args.client ? { client: args.client } : {}),
	});
	const errors = [...status.errors];
	const limit = args.limit ?? 50;

	if (!status.databases.project.exists) {
		errors.push(`project db missing: ${status.databases.project.path}`);
		return {
			available: false,
			status,
			tasks: [],
			truncated: false,
			errors,
		};
	}

	try {
		const reader = args.listTasks ?? listFusionTasksFromSqlite;
		const tasks = await reader(status.databases.project.path, {
			limit,
			includeArchived: args.includeArchived ?? false,
			timeoutMs: FUSION_SQLITE_TIMEOUT_MS,
		});
		return {
			available: status.available,
			status,
			tasks: toRoxFusionTaskMirrorEntries(tasks),
			truncated: tasks.length >= limit,
			errors,
		};
	} catch (error) {
		errors.push(`task list: ${errorMessage(error)}`);
		return {
			available: false,
			status,
			tasks: [],
			truncated: false,
			errors,
		};
	}
}

export const fusionRouter = router({
	status: queryProcedure
		.meta({ timeoutMs: FUSION_STATUS_TIMEOUT_MS })
		.input(statusInputSchema)
		.query(({ input }) => {
			return discoverFusionStatus({
				...(input?.projectPath ? { projectPath: input.projectPath } : {}),
				...(input?.dashboardUrl ? { dashboardUrl: input.dashboardUrl } : {}),
			});
		}),

	tasks: queryProcedure
		.meta({ timeoutMs: FUSION_TASKS_TIMEOUT_MS })
		.input(tasksInputSchema)
		.query(({ input }) => {
			return discoverFusionTaskMirrors({
				...(input?.projectPath ? { projectPath: input.projectPath } : {}),
				...(input?.dashboardUrl ? { dashboardUrl: input.dashboardUrl } : {}),
				limit: input?.limit ?? 50,
				includeArchived: input?.includeArchived ?? false,
			});
		}),
});
