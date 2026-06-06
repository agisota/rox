import { db } from "@superset/db/client";
import { workflowDefinitions } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

/**
 * Load a workflow definition scoped to the org (NOT_FOUND otherwise). Shared by
 * the workflow and skill routers so org isolation is enforced in one place.
 */
export async function getWorkflowDraftForOrg(
	organizationId: string,
	workflowId: string,
) {
	const [row] = await db
		.select()
		.from(workflowDefinitions)
		.where(
			and(
				eq(workflowDefinitions.id, workflowId),
				eq(workflowDefinitions.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
	}
	return row;
}
