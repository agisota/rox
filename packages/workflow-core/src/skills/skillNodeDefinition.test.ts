import { describe, expect, test } from "bun:test";
import type { JsonSchema } from "../types";
import { buildSkillNodeDefinition } from "./skillNodeDefinition";

describe("buildSkillNodeDefinition", () => {
	const inputSchema: JsonSchema = {
		type: "object",
		required: ["repo_id"],
		properties: {
			repo_id: { type: "string" },
			depth: { type: "number" },
		},
	};
	const outputSchema: JsonSchema = {
		type: "object",
		properties: { task_ids: { type: "array" } },
	};

	test("derives a skill_call:<slug> node type with typed ports", () => {
		const node = buildSkillNodeDefinition({
			slug: "analyze-repo",
			name: "Analyze Repo",
			inputSchema,
			outputSchema,
		});
		expect(node.type).toBe("skill_call:analyze-repo");
		expect(node.label).toBe("Analyze Repo");
		expect(node.inputs).toContainEqual({
			name: "repo_id",
			type: "string",
			required: true,
		});
		expect(node.inputs).toContainEqual({
			name: "depth",
			type: "number",
			required: false,
		});
		expect(node.outputs).toContainEqual({
			name: "task_ids",
			type: "array",
			required: false,
		});
		expect(node.riskLevel).toBe("medium");
	});
});
