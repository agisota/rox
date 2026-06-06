import { describe, expect, test } from "bun:test";
import { validateGraph } from "../graph/validateGraph";
import { FakePromptPlanner } from "./fakePlanner";
import { promptPlanToWorkflowState } from "./promptPlan";
import { promptPlanSchema } from "./promptPlanSchema";

const planner = new FakePromptPlanner();

const cards = [
	{ id: "1", text: "When I add a GitHub repo" },
	{ id: "2", text: "Analyze the architecture" },
	{ id: "3", text: "Detect risks" },
	{ id: "4", text: "Create tasks" },
	{ id: "5", text: "Ask for approval" },
];

describe("prompt board (M6)", () => {
	test("PROMPT-01: cards convert to a valid graph with expected blocks", async () => {
		const plan = await planner.generate(cards, { name: "Repo flow" });
		expect(promptPlanSchema.safeParse(plan).success).toBe(true);
		const state = promptPlanToWorkflowState(plan);
		const types = Object.values(state.blocks).map((b) => b.type);
		expect(types).toContain("start");
		expect(types).toContain("read_repo");
		expect(types).toContain("analyze_architecture");
		expect(types).toContain("detect_risks");
		expect(types).toContain("create_task");
		expect(types).toContain("human_approval");
		expect(types).toContain("response");
		expect(validateGraph(state).valid).toBe(true);
	});

	test("PROMPT-02: an invalid generated plan produces an invalid graph (rejected before save)", () => {
		// Simulate an LLM returning an edge to a missing node.
		const badPlan = {
			nodes: [
				{ id: "start", type: "start" },
				{ id: "a", type: "agent" },
			],
			edges: [{ source: "start", target: "ghost" }],
			metadata: { name: "bad" },
		};
		const state = promptPlanToWorkflowState(badPlan);
		const result = validateGraph(state);
		expect(result.valid).toBe(false);
	});

	test("PROMPT-03: each generated block traces back to its prompt card", async () => {
		const plan = await planner.generate(cards);
		const state = promptPlanToWorkflowState(plan);
		const riskBlock = Object.values(state.blocks).find(
			(b) => b.type === "detect_risks",
		);
		expect(riskBlock?.metadata?.sourcePromptCardId).toBe("3");
	});

	test("PROMPT-04: regenerating one card keeps unrelated block ids stable", async () => {
		const before = await planner.generate(cards);
		const idsBefore = before.nodes.map((n) => n.id).sort();
		// Edit card 3's text; ids are derived from card ids, so others are stable.
		const edited = cards.map((c) =>
			c.id === "3" ? { ...c, text: "Detect security vulnerabilities" } : c,
		);
		const after = await planner.generate(edited);
		const idsAfter = after.nodes.map((n) => n.id).sort();
		expect(idsAfter).toEqual(idsBefore);
	});
});
