import { db } from "@rox/db/client";
import { members } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Batched cross-org membership guard. Throws FORBIDDEN unless EVERY `userId` is
 * a member of `organizationId`. One query (`WHERE org=$1 AND user_id = ANY($2)`).
 * Dedupes; a no-op for empty input.
 *
 * Lives in its own module (not `utils.ts`) so the comms/calendar guard tests can
 * `mock.module("../integration/utils", ...)` without clobbering the real impl —
 * `assertOrgMembers.test.ts` unit-tests it via a direct `./assertOrgMembers`
 * import (bun `mock.module` is process-global, so the barrel mock would bleed).
 */
export async function assertOrgMembers(
	organizationId: string,
	userIds: string[],
): Promise<void> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return;

	const rows = await db
		.select({ userId: members.userId })
		.from(members)
		.where(
			and(
				eq(members.organizationId, organizationId),
				inArray(members.userId, unique),
			),
		);

	const found = new Set(rows.map((r) => r.userId));
	const missing = unique.filter((id) => !found.has(id));
	if (missing.length > 0) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "One or more recipients are not members of this organization",
		});
	}
}
