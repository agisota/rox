import { randomUUID } from "node:crypto";
import type { HostDb } from "../../../../db";
import { syncOutbox } from "../../../../db/schema";

/**
 * Outbox payloads. Each `kind` carries exactly what the worker needs to issue
 * the cloud create idempotently — notably the LOCAL entity id, which is
 * forwarded as the cloud-supplied id so a retry links the same row instead of
 * double-creating.
 */
export interface ProjectCreatePayload {
	/** Local project id, forwarded as the cloud `v2Project` id. */
	localProjectId: string;
	name: string;
	// The clone URL the create path already resolved from the live remote, to
	// forward to the cloud. Named `…ForCloud` (not `repoCloneUrl`) so it reads as
	// a forward, not a snapshot-column read (see no-snapshot-fields guard). Only
	// set when the repo has a parseable GitHub remote.
	repoCloneUrlForCloud?: string;
}

export interface WorkspaceCreatePayload {
	localWorkspaceId: string;
	localProjectId: string;
	repoPath: string;
	branch: string;
}

export function projectCreateDedupKey(localProjectId: string): string {
	return `project.create:${localProjectId}`;
}

export function workspaceCreateDedupKey(localWorkspaceId: string): string {
	return `workspace.create:${localWorkspaceId}`;
}

/**
 * Enqueue the cloud `v2Project.create`. Idempotent via the unique `dedupKey`:
 * re-enqueueing the same logical op is a no-op (`onConflictDoNothing`), so a
 * retried create never produces two outbox rows.
 */
export function enqueueProjectCreate(
	db: HostDb,
	payload: ProjectCreatePayload,
): void {
	db.insert(syncOutbox)
		.values({
			id: randomUUID(),
			kind: "project.create",
			dedupKey: projectCreateDedupKey(payload.localProjectId),
			payloadJson: JSON.stringify(payload),
		})
		.onConflictDoNothing({ target: syncOutbox.dedupKey })
		.run();
}

/** Enqueue the cloud `v2Workspace.create`. Idempotent (see above). */
export function enqueueWorkspaceCreate(
	db: HostDb,
	payload: WorkspaceCreatePayload,
): void {
	db.insert(syncOutbox)
		.values({
			id: randomUUID(),
			kind: "workspace.create",
			dedupKey: workspaceCreateDedupKey(payload.localWorkspaceId),
			payloadJson: JSON.stringify(payload),
		})
		.onConflictDoNothing({ target: syncOutbox.dedupKey })
		.run();
}
