import { findOrgMembership } from "@rox/db/utils";
import { TRPCError } from "@trpc/server";

// assertOrgMembers lives in its own module (re-exported here) so the comms /
// calendar guard tests can mock this barrel without clobbering its unit test.
export { assertOrgMembers } from "./assertOrgMembers";

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
