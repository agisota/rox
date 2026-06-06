import {
	type BlockPort,
	type BlockRiskLevel,
	skillCallBlockType,
} from "../blocks/blockDefinition";
import type { JsonSchema } from "../types";

export interface SkillNodeDefinitionInput {
	slug: string;
	name: string;
	inputSchema: JsonSchema;
	outputSchema: JsonSchema;
	/** Risk level surfaced from the skill's policy, when known. */
	riskLevel?: BlockRiskLevel;
}

export interface SkillNodeDefinition {
	/** Dynamic block type: `skill_call:<slug>`. */
	type: string;
	label: string;
	inputs: BlockPort[];
	outputs: BlockPort[];
	riskLevel: BlockRiskLevel;
}

/**
 * Derive named ports from an object JSON Schema's top-level properties.
 * Non-object schemas yield a single `value` port.
 */
function schemaToPorts(schema: JsonSchema): BlockPort[] {
	if (schema.type === "object" && schema.properties) {
		const required = new Set(schema.required ?? []);
		return Object.entries(schema.properties).map(([name, sub]) => ({
			name,
			type: typeof sub.type === "string" ? sub.type : undefined,
			required: required.has(name),
		}));
	}
	return [
		{
			name: "value",
			type: typeof schema.type === "string" ? schema.type : undefined,
		},
	];
}

/**
 * Build a draggable skill-call node definition from a published skill's typed
 * contract. Used by the canvas block palette and by graph validation.
 */
export function buildSkillNodeDefinition(
	skill: SkillNodeDefinitionInput,
): SkillNodeDefinition {
	return {
		type: skillCallBlockType(skill.slug),
		label: skill.name,
		inputs: schemaToPorts(skill.inputSchema),
		outputs: schemaToPorts(skill.outputSchema),
		riskLevel: skill.riskLevel ?? "medium",
	};
}
