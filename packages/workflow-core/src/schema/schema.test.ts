import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import type { JsonSchema } from "../types";
import { validateValueAgainstSchema } from "./jsonSchema";
import { validateInput } from "./validateInput";
import { validateOutput } from "./validateOutput";
import { validateSkillInputMapping } from "./validateSkillInputMapping";

describe("validateSkillInputMapping", () => {
	test("CORE-07: missing required input field is reported", () => {
		const inputSchema: JsonSchema = {
			type: "object",
			required: ["repo_id", "project_id"],
			properties: {
				repo_id: { type: "string" },
				project_id: { type: "string" },
			},
		};
		const mapping = { repo_id: "{{start.repo_id}}" };
		const issues = validateSkillInputMapping(mapping, inputSchema, "skillNode");
		expect(issues).toHaveLength(1);
		expect(issues[0]?.code).toBe(
			WorkflowErrorCode.SKILL_INPUT_MAPPING_MISSING_FIELD,
		);
		expect(issues[0]?.path).toBe("project_id");
		expect(issues[0]?.blockId).toBe("skillNode");
	});

	test("all required fields mapped => no issues", () => {
		const inputSchema: JsonSchema = {
			type: "object",
			required: ["repo_id"],
			properties: { repo_id: { type: "string" } },
		};
		expect(
			validateSkillInputMapping({ repo_id: "x" }, inputSchema),
		).toHaveLength(0);
	});

	test("empty-string binding counts as missing", () => {
		const inputSchema: JsonSchema = {
			type: "object",
			required: ["repo_id"],
		};
		expect(
			validateSkillInputMapping({ repo_id: "   " }, inputSchema),
		).toHaveLength(1);
	});
});

describe("validateOutput", () => {
	test("CORE-08: output schema type mismatch fails", () => {
		const outputSchema: JsonSchema = {
			type: "object",
			required: ["task_ids"],
			properties: { task_ids: { type: "array", items: { type: "string" } } },
		};
		const issues = validateOutput({ task_ids: "abc" }, outputSchema);
		expect(issues.length).toBeGreaterThan(0);
		expect(issues[0]?.code).toBe(
			WorkflowErrorCode.OUTPUT_SCHEMA_VALIDATION_FAILED,
		);
		expect(issues[0]?.path).toBe("$.task_ids");
	});

	test("valid output passes", () => {
		const outputSchema: JsonSchema = {
			type: "object",
			required: ["task_ids"],
			properties: { task_ids: { type: "array", items: { type: "string" } } },
		};
		expect(validateOutput({ task_ids: ["a", "b"] }, outputSchema)).toHaveLength(
			0,
		);
	});
});

describe("validateInput / validateValueAgainstSchema", () => {
	test("missing required input field fails", () => {
		const schema: JsonSchema = { type: "object", required: ["x"] };
		const issues = validateInput({}, schema);
		expect(issues[0]?.code).toBe(
			WorkflowErrorCode.INPUT_SCHEMA_VALIDATION_FAILED,
		);
	});

	test("nested array item type is validated", () => {
		const schema: JsonSchema = {
			type: "array",
			items: { type: "number" },
		};
		const violations = validateValueAgainstSchema([1, "two", 3], schema);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.path).toBe("$[1]");
	});

	test("enum is enforced", () => {
		const schema: JsonSchema = { enum: ["a", "b"] };
		expect(validateValueAgainstSchema("c", schema)).toHaveLength(1);
		expect(validateValueAgainstSchema("a", schema)).toHaveLength(0);
	});
});
