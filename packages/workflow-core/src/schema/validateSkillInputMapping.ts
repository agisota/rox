import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import type { JsonSchema } from "../types";
import { requiredFields } from "./jsonSchema";

/**
 * Validate that a skill-call node maps every required input field declared by
 * the target skill's input schema.
 *
 * `mapping` is the node's input bindings: each key is an input field name; the
 * value is its source expression (e.g. `"{{start.repo_id}}"`). A required field
 * that is absent (or bound to `undefined`/empty string) yields a
 * `SKILL_INPUT_MAPPING_MISSING_FIELD` issue.
 */
export function validateSkillInputMapping(
	mapping: Record<string, unknown>,
	inputSchema: JsonSchema,
	blockId?: string,
): WorkflowIssue[] {
	const issues: WorkflowIssue[] = [];
	for (const field of requiredFields(inputSchema)) {
		const bound = mapping[field];
		const missing =
			!(field in mapping) ||
			bound === undefined ||
			bound === null ||
			(typeof bound === "string" && bound.trim() === "");
		if (missing) {
			issues.push({
				code: WorkflowErrorCode.SKILL_INPUT_MAPPING_MISSING_FIELD,
				severity: "error",
				blockId,
				path: field,
				message: `Skill input mapping is missing required field "${field}"`,
			});
		}
	}
	return issues;
}
