import "server-only";
import { db } from "@rox/db/client";
import type { PublicSharePayload } from "@rox/db/schema";
import type { SharedResource } from "@rox/shared/share-link";

/**
 * Public, read-only projection of a shared session/artifact for the
 * `@<handle>/shared/<resource>/<descriptor>` namespace (ROX-522 Phase 2.2).
 *
 * SECURITY: only non-revoked `public_shares` rows owned by the profile user are
 * exposed (`createdByUserId = ownerUserId`, `revoked_at IS NULL`). The immutable
 * `payload` snapshot is already the public-safe contract (built by
 * `shareRouter.publishChatSession` / `publishArtifact`); private tenancy columns
 * (`organizationId`, `resourceId`) are not projected.
 */
export type PublicSharedResource = {
	resourceType: "chat_session" | "artifact";
	title: string | null;
	payload: PublicSharePayload;
	createdAt: Date;
};

const RESOURCE_TYPE: Record<SharedResource, "chat_session" | "artifact"> = {
	sessions: "chat_session",
	artifacts: "artifact",
};

/**
 * Resolve a shared resource for a profile owner.
 *
 * The share-link descriptor's `id` is the leading UUID group of the underlying
 * `public_shares.resource_id` (slugified UUIDs lose their later hyphen groups in
 * `parseSharePath`). We therefore match the owner's non-revoked shares of the
 * requested type whose `resource_id` starts with the parsed prefix. Scoping to
 * the owner keeps the prefix unambiguous in practice and never leaks other
 * users' shares.
 *
 * Returns `null` when no matching public share exists.
 */
export async function getPublicSharedResource(input: {
	ownerUserId: string;
	resource: SharedResource;
	id: string;
}): Promise<PublicSharedResource | null> {
	const resourceType = RESOURCE_TYPE[input.resource];

	const share = await db.query.publicShares.findFirst({
		where: (publicShares, { and, eq, isNull, like }) =>
			and(
				eq(publicShares.createdByUserId, input.ownerUserId),
				eq(publicShares.resourceType, resourceType),
				isNull(publicShares.revokedAt),
				like(publicShares.resourceId, `${input.id}%`),
			),
		columns: {
			resourceType: true,
			title: true,
			payload: true,
			createdAt: true,
		},
		orderBy: (publicShares, { desc }) => desc(publicShares.createdAt),
	});

	if (!share) return null;

	return {
		resourceType: share.resourceType,
		title: share.title,
		payload: share.payload,
		createdAt: share.createdAt,
	};
}
