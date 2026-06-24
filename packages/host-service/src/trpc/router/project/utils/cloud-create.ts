import { getErrorMessage } from "@rox/shared/error";
import { getHostId, getHostName } from "@rox/shared/host-info";
import { TRPCError } from "@trpc/server";
import { logger } from "../../../../lib/logger";
import type { HostServiceContext } from "../../../../types";

export type CloudCreateContext = Pick<
	HostServiceContext,
	"api" | "organizationId" | "clientMachineId"
>;

// Cloud v2Project.create catches v2_projects_org_slug_unique and re-throws as
// TRPCError CONFLICT with this exact message — kept stable so the slug retry
// below can detect it. If you change the cloud message, change this too.
export const SLUG_CONFLICT_MESSAGE = "Project slug already exists";

// Cloud v2Project.create re-throws a primary-key collision (same project id)
// as CONFLICT with this exact message. The outbox worker treats this as
// idempotent success: a previous drain already created the cloud row with our
// id and only the local link-back was lost (e.g. a crash mid-drain).
export const PROJECT_ID_IN_USE_MESSAGE = "Project id already in use";

export function isSlugConflict(err: unknown): boolean {
	return getErrorMessage(err) === SLUG_CONFLICT_MESSAGE;
}

export function isProjectIdAlreadyInUse(err: unknown): boolean {
	return getErrorMessage(err) === PROJECT_ID_IN_USE_MESSAGE;
}

function slugifyProjectName(name: string): string {
	const slug = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must contain at least one alphanumeric character",
		});
	}
	return slug;
}

/**
 * Create the cloud project, retrying on slug collision with a numeric suffix.
 * The client-supplied `id` is forwarded so the cloud row shares the local id.
 *
 * Shared by the synchronous-cloud create path and the local-first outbox
 * worker so both have identical slug-retry semantics.
 */
export async function createCloudProjectWithSlugRetry(
	ctx: CloudCreateContext,
	// `repoCloneUrlForCloud` is the URL the create path ALREADY resolved from the
	// live local remote and is forwarding to the cloud — not a snapshot read of a
	// `projects.repoCloneUrl` column (which the no-snapshot-fields guard forbids).
	args: { id: string; name: string; repoCloneUrlForCloud?: string },
) {
	const baseSlug = slugifyProjectName(args.name);
	let lastError: unknown;
	const maxAttempts = 100;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
		try {
			return await ctx.api.v2Project.create.mutate({
				organizationId: ctx.organizationId,
				id: args.id,
				name: args.name,
				slug,
				repoCloneUrl: args.repoCloneUrlForCloud,
			});
		} catch (err) {
			if (!isSlugConflict(err)) throw err;
			lastError = err;
			logger.warn("[project.create] slug conflict, retrying", {
				organizationId: ctx.organizationId,
				name: args.name,
				slug,
				attempt,
			});
		}
	}
	throw new TRPCError({
		code: "CONFLICT",
		message: `Could not allocate a unique slug for "${args.name}" after ${maxAttempts} attempts. Try a different project name.`,
		cause: lastError,
	});
}

/**
 * Create the cloud main workspace for an already-synced project. Mirrors the
 * cloud calls in `ensureMainWorkspaceStrict` (host.ensure + v2Workspace.create)
 * but takes the branch as input (the outbox worker recorded it at enqueue
 * time). Returns the cloud workspace id.
 */
export async function createCloudMainWorkspace(
	ctx: CloudCreateContext,
	args: { projectId: string; branch: string },
): Promise<{ id: string }> {
	const host = await ctx.api.host.ensure.mutate({
		organizationId: ctx.organizationId,
		machineId: getHostId(),
		name: getHostName(),
	});

	const cloudRow = await ctx.api.v2Workspace.create.mutate({
		organizationId: ctx.organizationId,
		projectId: args.projectId,
		name: args.branch,
		branch: args.branch,
		hostId: host.machineId,
		type: "main",
		clientMachineId: ctx.clientMachineId ?? getHostId(),
	});

	return { id: cloudRow.id };
}
