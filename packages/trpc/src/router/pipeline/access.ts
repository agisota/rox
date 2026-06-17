import { db } from "@rox/db/client";
import {
	pipelineTriggers,
	type SelectSkill,
	type SelectWorkflowDefinition,
	skills,
	workflowDefinitions,
} from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

/**
 * Load a pipeline (a `workflow_definitions` row with `engine="pipeline"`) scoped
 * to the org. NOT_FOUND when the row is missing, belongs to another org, or is a
 * plain workflow (engine !== "pipeline"). Shared by the pipeline + trigger
 * routers so pipeline isolation is enforced in one place.
 */
export async function getPipelineForOrg(
	organizationId: string,
	pipelineId: string,
): Promise<SelectWorkflowDefinition> {
	const [row] = await db
		.select()
		.from(workflowDefinitions)
		.where(
			and(
				eq(workflowDefinitions.id, pipelineId),
				eq(workflowDefinitions.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row || row.engine !== "pipeline") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline not found" });
	}
	return row;
}

/**
 * Load an agent-role skill (`skills` row with `kind="agent"`) scoped to the org.
 * NOT_FOUND when missing, cross-org, or not an agent role.
 */
export async function getAgentRoleForOrg(
	organizationId: string,
	roleSkillId: string,
): Promise<SelectSkill> {
	const [row] = await db
		.select()
		.from(skills)
		.where(
			and(
				eq(skills.id, roleSkillId),
				eq(skills.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row || row.kind !== "agent") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Agent role not found" });
	}
	return row;
}

/**
 * Load a `pipeline_triggers` row scoped to the org (NOT_FOUND otherwise).
 */
export async function getTriggerForOrg(
	organizationId: string,
	triggerId: string,
) {
	const [row] = await db
		.select()
		.from(pipelineTriggers)
		.where(
			and(
				eq(pipelineTriggers.id, triggerId),
				eq(pipelineTriggers.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" });
	}
	return row;
}
