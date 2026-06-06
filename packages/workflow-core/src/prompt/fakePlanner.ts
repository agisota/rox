import type {
	PromptCard,
	PromptPlan,
	PromptPlanNode,
	PromptPlanner,
} from "./promptPlan";

/** Deterministic keyword -> block type classification for a prompt card. */
export function classifyCard(text: string): { type: string; label: string } {
	const t = text.toLowerCase();
	if (/\bapprov|sign[- ]?off|review and confirm/.test(t)) {
		return { type: "human_approval", label: "Human Approval" };
	}
	if (/\btask|backlog|ticket|issue\b/.test(t)) {
		return { type: "create_task", label: "Create Tasks" };
	}
	if (/\brisk|vulnerab|security/.test(t)) {
		return { type: "detect_risks", label: "Detect Risks" };
	}
	if (/architect|analy|summar/.test(t)) {
		return { type: "analyze_architecture", label: "Analyze Architecture" };
	}
	if (/\brepo|clone|inspect|read code/.test(t)) {
		return { type: "read_repo", label: "Read Repo" };
	}
	if (/\bartifact|doc|report|save/.test(t)) {
		return { type: "create_artifact", label: "Save Artifact" };
	}
	return { type: "agent", label: "Agent Step" };
}

/** Stable node id for a card (so regenerating one card keeps others' ids; PROMPT-04). */
function nodeIdForCard(card: PromptCard): string {
	return `card_${card.id}`;
}

/**
 * A deterministic, dependency-free PromptPlanner used when no LLM key is
 * available. It classifies each card to a block type and chains them linearly
 * start -> card_1 -> ... -> card_n -> response, preserving card->block
 * traceability and stable node ids. Swap in a real LLM-backed planner behind
 * the same `PromptPlanner` port for live generation.
 */
export class FakePromptPlanner implements PromptPlanner {
	async generate(
		cards: PromptCard[],
		context?: { name?: string },
	): Promise<PromptPlan> {
		const nodes: PromptPlanNode[] = [
			{ id: "start", type: "start", label: "Start" },
		];
		const edges = [];
		let prev = "start";
		for (const card of cards) {
			const id = nodeIdForCard(card);
			const { type, label } = classifyCard(card.text);
			nodes.push({ id, type, label, sourcePromptCardId: card.id });
			edges.push({ source: prev, target: id });
			prev = id;
		}
		nodes.push({ id: "response", type: "response", label: "Response" });
		edges.push({ source: prev, target: "response" });
		return {
			nodes,
			edges,
			metadata: { name: context?.name ?? "Generated workflow" },
		};
	}
}
