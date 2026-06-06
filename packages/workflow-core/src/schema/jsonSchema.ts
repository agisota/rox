import type { JsonSchema } from "../types";

export interface SchemaViolation {
	path: string;
	message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesType(value: unknown, type: string): boolean {
	switch (type) {
		case "string":
			return typeof value === "string";
		case "number":
			return typeof value === "number" && !Number.isNaN(value);
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "boolean":
			return typeof value === "boolean";
		case "object":
			return isRecord(value);
		case "array":
			return Array.isArray(value);
		case "null":
			return value === null;
		default:
			// Unknown type keyword: don't fail, just accept.
			return true;
	}
}

/**
 * Validate a value against a JSON Schema (draft 2020-12 subset: `type`,
 * `required`, `properties`, `items`, `enum`). Returns a flat list of
 * violations with JSON paths. Empty list = valid.
 *
 * Intentionally dependency-free and conservative: unknown keywords are ignored
 * rather than rejected, so partially-specified schemas still validate the parts
 * they do describe.
 */
export function validateValueAgainstSchema(
	value: unknown,
	schema: JsonSchema,
	path = "$",
): SchemaViolation[] {
	const violations: SchemaViolation[] = [];

	if (typeof schema.type === "string" && !matchesType(value, schema.type)) {
		violations.push({ path, message: `expected type "${schema.type}"` });
		// Type mismatch makes deeper checks meaningless.
		return violations;
	}

	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		violations.push({
			path,
			message: `value is not one of the allowed enum options`,
		});
	}

	if (schema.type === "object" && isRecord(value)) {
		for (const required of schema.required ?? []) {
			if (!(required in value)) {
				violations.push({
					path: `${path}.${required}`,
					message: `missing required property "${required}"`,
				});
			}
		}
		if (schema.properties) {
			for (const [key, subSchema] of Object.entries(schema.properties)) {
				if (key in value) {
					violations.push(
						...validateValueAgainstSchema(
							value[key],
							subSchema,
							`${path}.${key}`,
						),
					);
				}
			}
		}
	}

	if (
		schema.type === "array" &&
		Array.isArray(value) &&
		schema.items &&
		!Array.isArray(schema.items)
	) {
		const itemSchema = schema.items;
		value.forEach((item, i) => {
			violations.push(
				...validateValueAgainstSchema(item, itemSchema, `${path}[${i}]`),
			);
		});
	}

	return violations;
}

/** Top-level required property names declared by an object schema. */
export function requiredFields(schema: JsonSchema): string[] {
	return [...(schema.required ?? [])];
}
