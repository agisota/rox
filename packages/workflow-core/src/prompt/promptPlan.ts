import type {
	SupersetBlockState,
	SupersetEdge,
	SupersetWorkflowState,
} from "../types";

/** A single card on the prompt board. */
export interface PromptCard {
	id: string;
	text: string;
}

/** A node in the LLM-produced structured graph plan. */
export interface PromptPlanNode {
	id: string;
	type: string;
	label?: string;
	/** The prompt card this node was generated from (traceability, PROMPT-03). */
	sourcePromptCardId?: string;
	subBlocks?: Record<string, unknown>;
}

export interface PromptPlanEdge {
	source: string;
	target: string;
	sourceHandle?: string;
}

/** The structured plan an LLM (or fake adapter) returns for a set of cards. */
export interface PromptPlan {
	nodes: PromptPlanNode[];
	edges: PromptPlanEdge[];
	metadata: { name: string; description?: string };
}

/** A planner converts prompt cards into a structured graph plan. */
export interface PromptPlanner {
	generate(
		cards: PromptCard[],
		context?: { name?: string },
	): Promise<PromptPlan>;
}

/**
 * Convert a structured plan into a Superset workflow graph. Each node carries
 * its `sourcePromptCardId` in metadata so the canvas can trace a block back to
 * the card that produced it (PROMPT-03).
 */
export function promptPlanToWorkflowState(
	plan: PromptPlan,
): SupersetWorkflowState {
	const blocks: Record<string, SupersetBlockState> = {};
	for (const node of plan.nodes) {
		const metadata: Record<string, unknown> = {};
		if (node.sourcePromptCardId) {
			metadata.sourcePromptCardId = node.sourcePromptCardId;
		}
		blocks[node.id] = {
			type: node.type,
			name: node.label,
			subBlocks: node.subBlocks,
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		};
	}
	const edges: SupersetEdge[] = plan.edges.map((e) => ({
		source: e.source,
		target: e.target,
		sourceHandle: e.sourceHandle,
	}));
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: plan.metadata,
	};
}
