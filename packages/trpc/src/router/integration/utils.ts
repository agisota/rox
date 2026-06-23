import { db } from "@rox/db/client";
import { members } from "@rox/db/schema";
import { findOrgMembership } from "@rox/db/utils";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

export async function verifyOrgMembership(
	userId: string,
	organizationId: string,
) {
	const membership = await findOrgMembership({ userId, organizationId });

	if (!membership) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}

	return { membership };
}

export async function verifyOrgAdmin(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "admin" && membership.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Admin access required",
		});
	}

	return { membership };
}

export async function verifyOrgOwner(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only owners can delete projects",
		});
	}

	return { membership };
}

/**
 * Batched cross-org membership guard. Throws FORBIDDEN unless EVERY `userId` is
 * a member of `organizationId`. One query (`WHERE org=$1 AND user_id = ANY($2)`).
 * Dedupes; a no-op for empty input.
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
