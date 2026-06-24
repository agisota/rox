import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../../db/schema";
import { logger } from "../../../lib/logger";
import type { HostServiceContext } from "../../../types";
import { getHostLocalFirstCreate } from "../settings/host-settings";
import { createCloudProjectWithSlugRetry } from "./utils/cloud-create";
import {
	ensureMainWorkspaceLocal,
	ensureMainWorkspaceStrict,
} from "./utils/ensure-main-workspace";
import { enqueueProjectCreate, enqueueWorkspaceCreate } from "./utils/outbox";
import { persistLocalProject } from "./utils/persist-project";
import {
	cloneRepoInto,
	cloneTemplateInto,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	resolveLocalRepo,
	tryRevParseGitRoot,
} from "./utils/resolve-repo";
import { applyWorkspaceStarterPresets } from "./utils/starter-presets";

function dirNameForEmpty(name: string): string {
	const slug = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must produce a non-empty directory name",
		});
	}
	return slug;
}

interface CreateResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string;
}

interface PersistArgs {
	name: string;
	resolved: ResolvedRepo;
	cleanupRepoPathOnFailure: boolean;
	repoCloneUrlForCloud?: string;
	starterPresetIds?: readonly string[];
}

/**
 * Create-project entry point. Dispatches on the `localFirstCreate` host setting:
 *
 *   OFF (default) → `persistSynchronousCloud`: today's behavior exactly — the
 *     create saga is a single commit unit spanning the cloud, and any cloud
 *     failure rolls everything back (local row + repo dir).
 *
 *   ON → `persistLocalFirst`: local ops + a local DB record return INSTANTLY
 *     with no network; the cloud project + main workspace are enqueued in
 *     `sync_outbox` and linked later by the background worker. A cloud failure
 *     is non-fatal and NEVER rolls back the local project.
 *
 * The OFF path is the unchanged original function body, so flipping the flag
 * off is provably byte-for-byte the prior behavior.
 */
async function persistFromResolved(
	ctx: HostServiceContext,
	args: PersistArgs,
): Promise<CreateResult> {
	if (getHostLocalFirstCreate(ctx.db)) {
		return persistLocalFirst(ctx, args);
	}
	return persistSynchronousCloud(ctx, args);
}

/**
 * Synchronous-cloud create saga (the historical behavior). The saga as a whole
 * is the commit unit:
 *
 *   1. Local file ops (handled by the caller — clone / mkdir / etc.)
 *   2. Local DB project row (with client-supplied UUID)
 *   3. Cloud v2Project.create   (FK-required before workspace)
 *   4. Cloud v2Workspace.create + local workspace (ensureMainWorkspaceStrict)
 *
 * Any failure unwinds the prior steps in reverse, including a cloud
 * v2Project.delete to roll back step 3 if step 4 throws.
 */
async function persistSynchronousCloud(
	ctx: HostServiceContext,
	args: PersistArgs,
): Promise<CreateResult> {
	const projectId = randomUUID();
	let localProjectInserted = false;
	let cloudProjectCreated = false;

	try {
		applyWorkspaceStarterPresets({
			repoPath: args.resolved.repoPath,
			starterPresetIds: args.starterPresetIds,
		});

		persistLocalProject(ctx, projectId, args.resolved);
		localProjectInserted = true;

		await createCloudProjectWithSlugRetry(ctx, {
			id: projectId,
			name: args.name,
			repoCloneUrl: args.repoCloneUrlForCloud,
		});
		cloudProjectCreated = true;

		const mainWorkspace = await ensureMainWorkspaceStrict(
			ctx,
			projectId,
			args.resolved.repoPath,
		);

		return {
			projectId,
			repoPath: args.resolved.repoPath,
			mainWorkspaceId: mainWorkspace.id,
		};
	} catch (err) {
		if (cloudProjectCreated) {
			try {
				await ctx.api.v2Project.delete.mutate({
					organizationId: ctx.organizationId,
					id: projectId,
				});
			} catch (cleanupErr) {
				logger.warn(
					"[project.create] cloud rollback failed; orphan cloud row may remain",
					{ projectId, cleanupErr },
				);
			}
		}
		if (localProjectInserted) {
			try {
				ctx.db.delete(projects).where(eq(projects.id, projectId)).run();
			} catch (cleanupErr) {
				logger.warn("[project.create] local rollback failed", {
					projectId,
					cleanupErr,
				});
			}
		}
		if (args.cleanupRepoPathOnFailure) {
			try {
				rmSync(args.resolved.repoPath, { recursive: true, force: true });
			} catch (cleanupErr) {
				logger.warn("[project.create] repo dir cleanup failed", {
					repoPath: args.resolved.repoPath,
					cleanupErr,
				});
			}
		}
		throw err;
	}
}

/**
 * Local-first create. Does the local ops + a local DB record (project +
 * main workspace), enqueues the cloud creates into `sync_outbox`, and returns
 * immediately — ZERO network. A cloud failure later is the worker's problem
 * (retried with backoff); it is NEVER allowed to roll back the local project,
 * which is the whole point. Only genuine LOCAL failures (disk/db) propagate.
 *
 * The local project id is a fresh UUID forwarded to the cloud as the supplied
 * id, so once the worker drains, `projects.cloudId === projects.id`.
 */
async function persistLocalFirst(
	ctx: HostServiceContext,
	args: PersistArgs,
): Promise<CreateResult> {
	const projectId = randomUUID();

	applyWorkspaceStarterPresets({
		repoPath: args.resolved.repoPath,
		starterPresetIds: args.starterPresetIds,
	});

	// Local project row, marked pending so downstream/cloud-only features know
	// the cloud mirror hasn't landed yet.
	persistLocalProject(ctx, projectId, args.resolved, { syncState: "pending" });

	// Local-only main workspace (no cloud call, relaxed detached-HEAD).
	const mainWorkspace = await ensureMainWorkspaceLocal(
		ctx,
		projectId,
		args.resolved.repoPath,
	);

	// Enqueue the cloud creates (idempotent via dedup keys). Order matters only
	// as a hint — the worker defers the workspace row until the project syncs.
	enqueueProjectCreate(ctx.db, {
		localProjectId: projectId,
		name: args.name,
		repoCloneUrl: args.repoCloneUrlForCloud,
	});
	enqueueWorkspaceCreate(ctx.db, {
		localWorkspaceId: mainWorkspace.id,
		localProjectId: projectId,
		repoPath: args.resolved.repoPath,
		branch: mainWorkspace.branch,
	});

	return {
		projectId,
		repoPath: args.resolved.repoPath,
		mainWorkspaceId: mainWorkspace.id,
	};
}

export async function createFromClone(
	ctx: HostServiceContext,
	args: {
		name: string;
		parentDir: string;
		url: string;
		starterPresetIds?: readonly string[];
	},
): Promise<CreateResult> {
	const resolved = await cloneRepoInto(
		args.url,
		args.parentDir,
		ctx.credentials,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		cleanupRepoPathOnFailure: true,
		starterPresetIds: args.starterPresetIds,
		// Only forward to cloud if the cloned repo actually has a parseable
		// GitHub remote — non-GitHub URLs and local paths become local-only
		// projects with no cloud repoCloneUrl.
		repoCloneUrlForCloud: resolved.parsed?.url,
	});
}

/**
 * Resolve an existing repo, or — when `initIfNeeded` and the folder isn't a git
 * repo yet — `git init` it in place first. The init branch only runs after the
 * UI has confirmed intent with the user.
 */
async function resolveOrInitLocalRepo(
	repoPath: string,
	initIfNeeded: boolean,
): Promise<ResolvedRepo> {
	if (!initIfNeeded) return resolveLocalRepo(repoPath);
	const root = await tryRevParseGitRoot(repoPath);
	return root ? resolveLocalRepo(root) : initLocalRepoInPlace(repoPath);
}

export async function createFromImportLocal(
	ctx: HostServiceContext,
	args: {
		name: string;
		repoPath: string;
		initIfNeeded?: boolean;
		starterPresetIds?: readonly string[];
	},
): Promise<CreateResult> {
	const resolved = await resolveOrInitLocalRepo(
		args.repoPath,
		args.initIfNeeded ?? false,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		starterPresetIds: args.starterPresetIds,
		// User pointed us at an existing folder; never rm it.
		cleanupRepoPathOnFailure: false,
		repoCloneUrlForCloud: resolved.parsed?.url,
	});
}

/**
 * Empty mode: mkdir + git init + initial commit, then run the saga.
 * The project lives local-only — no GitHub remote until first push.
 */
export async function createFromEmpty(
	ctx: HostServiceContext,
	args: {
		name: string;
		parentDir: string;
		starterPresetIds?: readonly string[];
	},
): Promise<CreateResult> {
	const resolved = await initEmptyRepo(
		args.parentDir,
		dirNameForEmpty(args.name),
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		starterPresetIds: args.starterPresetIds,
		cleanupRepoPathOnFailure: true,
	});
}

/**
 * Template mode: clone the template repo, strip history, re-init, then
 * run the saga. Like empty, the project lives local-only — no GitHub
 * remote until first push.
 */
export async function createFromTemplate(
	ctx: HostServiceContext,
	args: {
		name: string;
		parentDir: string;
		url: string;
		starterPresetIds?: readonly string[];
	},
): Promise<CreateResult> {
	const resolved = await cloneTemplateInto(
		args.url,
		args.parentDir,
		dirNameForEmpty(args.name),
		ctx.credentials,
	);
	return persistFromResolved(ctx, {
		name: args.name,
		resolved,
		starterPresetIds: args.starterPresetIds,
		cleanupRepoPathOnFailure: true,
	});
}
