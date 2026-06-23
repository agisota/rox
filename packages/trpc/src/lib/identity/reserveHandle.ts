/**
 * `reserveHandle` — the S1 primitive (DQ4). Insert-or-own a row in the global
 * `identity_handles` registry. A handle is the user's only if no row exists
 * (created) or the existing row is already theirs (owned); anything else —
 * including a freed handle whose owner was set-null — throws CONFLICT, so a
 * handle is never recycled to a different user.
 *
 * Always call inside the provision/rename `dbWs.transaction` so reservation is
 * atomic with the address writes.
 */

import { identityHandles } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Tx } from "./provisionIdentity";

export interface ReserveHandleArgs {
	/** Lowercased handle. */
	normalizedHandle: string;
	/** The user attempting to own it. */
	userId: string;
}

export async function reserveHandle(
	tx: Tx,
	{ normalizedHandle, userId }: ReserveHandleArgs,
): Promise<{ handleId: string; outcome: "created" | "owned" }> {
	const [created] = await tx
		.insert(identityHandles)
		.values({
			normalizedHandle,
			currentOwnerUserId: userId,
			firstOwnerUserId: userId,
			status: "active",
		})
		.onConflictDoNothing({ target: identityHandles.normalizedHandle })
		.returning({ id: identityHandles.id });

	if (created) return { handleId: created.id, outcome: "created" };

	// A row already existed — must be this user's, or the handle is taken.
	const [existing] = await tx
		.select({
			id: identityHandles.id,
			currentOwnerUserId: identityHandles.currentOwnerUserId,
		})
		.from(identityHandles)
		.where(eq(identityHandles.normalizedHandle, normalizedHandle))
		.limit(1);

	if (!existing) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Handle reservation lookup failed after conflict.",
		});
	}
	if (existing.currentOwnerUserId !== userId) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Это имя пользователя уже занято.",
		});
	}
	return { handleId: existing.id, outcome: "owned" };
}
