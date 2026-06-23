/**
 * Collaboration (#11) — durable comment threads on graph objects
 * (`collaboration.threadsAsObjects`).
 *
 * The write/read core for object comments, kept as a thin, dependency-injected
 * service (mirrors `graph-service.ts`) so the router stays a wiring shim and the
 * logic is unit-testable without a live DB. Comments anchor to a universal node
 * (`entities.id`): a thread is got-or-created per `(org, entity)`, then comments
 * are appended.
 *
 * Tenancy is enforced twice: every read/write filters by `organizationId`, AND
 * the anchored entity is validated to belong to the caller's org BEFORE any
 * thread is touched — so a caller can never read or write comments on an object
 * in another org (no cross-org leakage), even before the composite-FK guard.
 */

import { comments, commentThreads, entities } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import type { GraphDb, GraphTx } from "./types";

/** A comment as returned to clients (thread membership is implicit per object). */
export interface CommentView {
	id: string;
	threadId: string;
	authorUserId: string | null;
	body: string;
	createdAt: Date;
}

/**
 * Assert `entityId` is an object in `orgId`. Throws NOT_FOUND otherwise, which
 * doubles as the cross-org guard: an entity in another org is indistinguishable
 * from a missing one, so we never confirm its existence to an outside caller.
 */
async function assertEntityInOrg(
	dbHandle: GraphDb | GraphTx,
	orgId: string,
	entityId: string,
): Promise<void> {
	const [row] = await dbHandle
		.select({ id: entities.id })
		.from(entities)
		.where(and(eq(entities.organizationId, orgId), eq(entities.id, entityId)))
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Object not found" });
	}
}

/**
 * List the comments on an object (oldest first), org-scoped.
 *
 * Validates the object belongs to the caller's org first; if no thread exists
 * yet the list is simply empty (a thread is lazily created on first comment).
 */
export async function listComments(
	db: GraphDb,
	params: { orgId: string; entityId: string; limit: number },
): Promise<CommentView[]> {
	await assertEntityInOrg(db, params.orgId, params.entityId);

	const [thread] = await db
		.select({ id: commentThreads.id })
		.from(commentThreads)
		.where(
			and(
				eq(commentThreads.organizationId, params.orgId),
				eq(commentThreads.entityId, params.entityId),
			),
		)
		.limit(1);
	if (!thread) return [];

	const rows = await db
		.select({
			id: comments.id,
			threadId: comments.threadId,
			authorUserId: comments.authorUserId,
			body: comments.body,
			createdAt: comments.createdAt,
		})
		.from(comments)
		.where(
			and(
				eq(comments.organizationId, params.orgId),
				eq(comments.threadId, thread.id),
			),
		)
		.orderBy(asc(comments.createdAt))
		.limit(params.limit);

	return rows;
}

/**
 * Get the thread for `(org, entity)`, creating it if absent. Runs inside the
 * caller's write transaction. The `(org, entity)` unique index makes the
 * create idempotent under a race: on conflict we re-read the existing row.
 */
async function getOrCreateThread(
	tx: GraphTx,
	params: {
		orgId: string;
		entityId: string;
		v2ProjectId: string | null;
		createdByUserId: string;
	},
): Promise<string> {
	const [existing] = await tx
		.select({ id: commentThreads.id })
		.from(commentThreads)
		.where(
			and(
				eq(commentThreads.organizationId, params.orgId),
				eq(commentThreads.entityId, params.entityId),
			),
		)
		.limit(1);
	if (existing) return existing.id;

	const inserted = await tx
		.insert(commentThreads)
		.values({
			organizationId: params.orgId,
			entityId: params.entityId,
			v2ProjectId: params.v2ProjectId,
			createdByUserId: params.createdByUserId,
		})
		.onConflictDoNothing({
			target: [commentThreads.organizationId, commentThreads.entityId],
		})
		.returning({ id: commentThreads.id });
	if (inserted[0]) return inserted[0].id;

	// Lost the insert race — the row now exists; re-read it.
	const [racedThread] = await tx
		.select({ id: commentThreads.id })
		.from(commentThreads)
		.where(
			and(
				eq(commentThreads.organizationId, params.orgId),
				eq(commentThreads.entityId, params.entityId),
			),
		)
		.limit(1);
	if (!racedThread) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to resolve comment thread",
		});
	}
	return racedThread.id;
}

/**
 * Create a comment on an object (`authorUserId` = the caller). Runs inside the
 * caller's write transaction.
 *
 * 1. validate the object belongs to the caller's org (cross-org guard),
 * 2. get-or-create the object's thread,
 * 3. append the comment.
 */
export async function createComment(
	tx: GraphTx,
	params: {
		orgId: string;
		entityId: string;
		v2ProjectId: string | null;
		authorUserId: string;
		body: string;
	},
): Promise<CommentView> {
	await assertEntityInOrg(tx, params.orgId, params.entityId);

	const threadId = await getOrCreateThread(tx, {
		orgId: params.orgId,
		entityId: params.entityId,
		v2ProjectId: params.v2ProjectId,
		createdByUserId: params.authorUserId,
	});

	const [row] = await tx
		.insert(comments)
		.values({
			organizationId: params.orgId,
			threadId,
			authorUserId: params.authorUserId,
			body: params.body,
		})
		.returning({
			id: comments.id,
			threadId: comments.threadId,
			authorUserId: comments.authorUserId,
			body: comments.body,
			createdAt: comments.createdAt,
		});
	if (!row) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create comment",
		});
	}
	return row;
}
