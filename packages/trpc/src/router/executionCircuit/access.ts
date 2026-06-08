import { db } from "@rox/db/client";
import { executionCircuits } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

/**
 * Load an execution circuit scoped to the org (NOT_FOUND otherwise). Org
 * isolation for the circuit router lives here, mirroring `workflow/access.ts`.
 */
export async function getCircuitForOrg(
	organizationId: string,
	circuitId: string,
) {
	const [row] = await db
		.select()
		.from(executionCircuits)
		.where(
			and(
				eq(executionCircuits.id, circuitId),
				eq(executionCircuits.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Execution circuit not found",
		});
	}
	return row;
}

/** Load the 1:1 draft circuit for a task in the org, or null when absent. */
export async function getCircuitForTask(
	organizationId: string,
	taskId: string,
) {
	const [row] = await db
		.select()
		.from(executionCircuits)
		.where(
			and(
				eq(executionCircuits.taskId, taskId),
				eq(executionCircuits.organizationId, organizationId),
			),
		)
		.limit(1);
	return row ?? null;
}
