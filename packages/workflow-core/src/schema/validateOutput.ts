import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import type { JsonSchema } from "../types";
import { validateValueAgainstSchema } from "./jsonSchema";

/**
 * Validate a skill/workflow output value against its declared output schema.
 * Returns `OUTPUT_SCHEMA_VALIDATION_FAILED` issues (one per violation).
 */
export function validateOutput(
	value: unknown,
	schema: JsonSchema,
): WorkflowIssue[] {
	return validateValueAgainstSchema(value, schema).map((v) => ({
		code: WorkflowErrorCode.OUTPUT_SCHEMA_VALIDATION_FAILED,
		severity: "error",
		path: v.path,
		message: v.message,
	}));
}
