import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import type { RoxBlockState } from "../types";
import type { NodeTypeDefinition } from "./nodeTypeDefinition";

/** True when a subBlocks value counts as "provided" for a required field. */
function isProvided(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	return true;
}

/**
 * Validate a single block's `subBlocks` against its node-type definition, in two
 * layers:
 *  1. required fields (from `def.fields[].required`) must be provided;
 *  2. the provided config must parse against `def.configSchema` (zod).
 *
 * Pure + db-free. Issues are anchored to `blockId`. This is the registry-driven
 * required-config + shape check that `validateGraph` opts into; it is also used
 * by the editor to surface per-node problems.
 */
export function validateNodeConfig(
	def: NodeTypeDefinition,
	block: RoxBlockState,
	blockId: string,
): WorkflowIssue[] {
	const issues: WorkflowIssue[] = [];
	const sub = block.subBlocks ?? {};

	for (const field of def.fields) {
		if (field.required && !isProvided(sub[field.key])) {
			issues.push({
				code: WorkflowErrorCode.MISSING_REQUIRED_CONFIG,
				severity: "error",
				blockId,
				path: field.key,
				message: `Узел "${block.name ?? blockId}" требует поле «${field.label}».`,
			});
		}
	}

	const parsed = def.configSchema.safeParse(sub);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const path = issue.path.map((p) => String(p)).join(".");
			issues.push({
				code: WorkflowErrorCode.INVALID_NODE_CONFIG,
				severity: "error",
				blockId,
				path: path || undefined,
				message: `Узел "${block.name ?? blockId}": ${issue.message}${
					path ? ` (${path})` : ""
				}.`,
			});
		}
	}

	return issues;
}
