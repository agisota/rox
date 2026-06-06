import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import type { JsonSchema } from "../types";
import { validateValueAgainstSchema } from "./jsonSchema";

/**
 * Validate a skill/workflow input value against its declared input schema.
 * Returns `INPUT_SCHEMA_VALIDATION_FAILED` issues (one per violation).
 */
export function validateInput(
	value: unknown,
	schema: JsonSchema,
): WorkflowIssue[] {
	return validateValueAgainstSchema(value, schema).map((v) => ({
		code: WorkflowErrorCode.INPUT_SCHEMA_VALIDATION_FAILED,
		severity: "error",
		path: v.path,
		message: v.message,
	}));
}
