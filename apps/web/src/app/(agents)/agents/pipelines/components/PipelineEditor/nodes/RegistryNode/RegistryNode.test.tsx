import { describe, expect, test } from "bun:test";
import { ReactFlowProvider } from "@rox/ui/ai-elements/flow";
import { getNodeType } from "@rox/workflow-core";
import { renderToStaticMarkup } from "react-dom/server";
import type { PipelineFlowNode } from "../../graph-adapter";
import { nodeConfigSummary } from "./nodeConfigSummary";
import { RegistryNode } from "./RegistryNode";

/**
 * SSR markup assertions for the registry-driven canvas node (the established web
 * pattern — `renderToStaticMarkup`, no DOM harness). `Handle` reads xyflow store
 * context, so we wrap the node in a `ReactFlowProvider`. We assert the node
 * renders its label, category/type line, branch legend, and config summary from
 * the registry — proving the renderer is fully data-driven.
 */

function node(
	blockType: string,
	overrides: Partial<PipelineFlowNode["data"]> = {},
): PipelineFlowNode {
	return {
		id: `${blockType}_1`,
		type: "pipelineRegistry",
		position: { x: 0, y: 0 },
		data: {
			blockId: `${blockType}_1`,
			kind: "agent_run",
			blockType,
			label: overrides.label ?? "Узел",
			enabled: overrides.enabled,
			subBlocks: overrides.subBlocks,
			roleSlug: overrides.roleSlug,
		},
	};
}

function render(n: PipelineFlowNode, selected = false): string {
	return renderToStaticMarkup(
		<ReactFlowProvider>
			<RegistryNode
				id={n.id}
				type={n.type as string}
				data={n.data}
				selected={selected}
				dragging={false}
				zIndex={0}
				isConnectable
				positionAbsoluteX={0}
				positionAbsoluteY={0}
				deletable
				selectable
				draggable
			/>
		</ReactFlowProvider>,
	);
}

describe("RegistryNode (registry-driven)", () => {
	test("renders the label + category/type line from the registry", () => {
		const html = render(node("model", { label: "Сводка" }));
		expect(html).toContain("Сводка");
		// category · type line (AI · Модель (LLM))
		expect(html).toContain("Модель (LLM)");
		expect(html).toContain("ИИ");
	});

	test("renders a branch legend for a fan-out node (condition true/false)", () => {
		const html = render(node("condition"));
		// Branch labels come from the registry out-port labels.
		expect(html).toContain("Истина");
		expect(html).toContain("Ложь");
	});

	test("summarises set config fields in the body", () => {
		const html = render(
			node("notify", { subBlocks: { channel: "email", message: "Привет" } }),
		);
		expect(html).toContain("Привет");
	});

	test("shows the role badge for an agent_run node", () => {
		const html = render(node("agent_run", { roleSlug: "critic" }));
		expect(html).toContain("critic");
	});

	test("dims and badges a disabled node", () => {
		const html = render(node("model", { enabled: false }));
		expect(html).toContain("opacity-60");
		expect(html).toContain("выкл");
	});

	test("an unknown/legacy type still renders without throwing", () => {
		const html = render(node("skill_call:legacy", { label: "Legacy" }));
		expect(html).toContain("Legacy");
	});
});

describe("nodeConfigSummary", () => {
	test("skips empty and absent values, keeps set ones (field order)", () => {
		const def = getNodeType("model");
		if (!def) throw new Error("model not registered");
		const lines = nodeConfigSummary(def, {
			model: "gpt-5",
			systemPrompt: "  ",
			userPrompt: "Сделай сводку",
		});
		expect(lines.map((l) => l.value)).toContain("gpt-5");
		expect(lines.map((l) => l.value)).toContain("Сделай сводку");
		// Whitespace-only systemPrompt is skipped.
		expect(lines.some((l) => l.label.includes("Системный"))).toBe(false);
	});

	test("truncates long strings and caps the number of lines", () => {
		const def = getNodeType("model");
		if (!def) throw new Error("model not registered");
		const long = "a".repeat(200);
		const lines = nodeConfigSummary(def, {
			model: long,
			userPrompt: long,
			systemPrompt: long,
			temperature: 0.5,
			maxTokens: 100,
		});
		expect(lines.length).toBeLessThanOrEqual(3);
		for (const line of lines) {
			expect(line.value.length).toBeLessThanOrEqual(40);
		}
	});

	test("renders objects/arrays as compact counts and returns [] for no config", () => {
		const def = getNodeType("switch");
		if (!def) throw new Error("switch not registered");
		const lines = nodeConfigSummary(def, { cases: { a: "1", b: "2" } });
		expect(lines.find((l) => l.label.includes("Случаи"))?.value).toContain(
			"ключ",
		);
		expect(nodeConfigSummary(def, undefined)).toEqual([]);
	});

	test("never surfaces roleSlug (the renderer badges it separately)", () => {
		const def = getNodeType("agent_run");
		if (!def) throw new Error("agent_run not registered");
		const lines = nodeConfigSummary(def, { roleSlug: "critic" });
		expect(lines.some((l) => l.value === "critic")).toBe(false);
	});
});
