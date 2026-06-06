import type { CoreBlockType } from "../types";

/** Coarse risk classification used by policy + UI. */
export type BlockRiskLevel = "none" | "low" | "medium" | "high";

export interface BlockPort {
	name: string;
	/** JSON Schema `type` keyword for the port's value, when known. */
	type?: string;
	required?: boolean;
}

export interface BlockDefinition {
	type: string;
	label: string;
	description?: string;
	/** Named output handles (e.g. condition's `true`/`false`). */
	outputs: BlockPort[];
	inputs: BlockPort[];
	risk: BlockRiskLevel;
	/** Whether the block needs a human decision (pauses a run). */
	pausesRun?: boolean;
}

/** Helper for declaring core block definitions concisely. */
export function defineBlock(
	type: CoreBlockType,
	def: Omit<BlockDefinition, "type">,
): BlockDefinition {
	return { type, ...def };
}

/** The dynamic block type used by a published skill node. */
export function skillCallBlockType(slug: string): string {
	return `skill_call:${slug}`;
}

/** True when a block type refers to a skill call (`skill_call:<slug>`). */
export function isSkillCallType(type: string): boolean {
	return type.startsWith("skill_call:");
}

/** Extract the skill slug from a `skill_call:<slug>` block type. */
export function skillSlugFromType(type: string): string | null {
	return isSkillCallType(type) ? type.slice("skill_call:".length) : null;
}
