import { describe, expect, test } from "bun:test";
import { canConnect } from "./connection-rules";
import type { PipelineFlowEdge, PipelineFlowNode } from "./graph-adapter";

function node(
	id: string,
	kind: PipelineFlowNode["data"]["kind"],
): PipelineFlowNode {
	return {
		id,
		type: kind === "start" ? "pipelineStart" : `pipeline_${kind}`,
		position: { x: 0, y: 0 },
		data: { blockId: id, kind, blockType: kind, label: id },
	};
}

const NODES: PipelineFlowNode[] = [
	node("start", "start"),
	node("a", "agent_run"),
	node("b", "agent_run"),
	node("gate", "human_approval"),
];

describe("canConnect", () => {
	test("allows a normal forward edge", () => {
		expect(canConnect({ source: "a", target: "b" }, NODES, [])).toBe(true);
	});

	test("rejects a missing endpoint", () => {
		expect(canConnect({ source: "a", target: null }, NODES, [])).toBe(false);
		expect(canConnect({ source: null, target: "b" }, NODES, [])).toBe(false);
	});

	test("rejects a self-loop", () => {
		expect(canConnect({ source: "a", target: "a" }, NODES, [])).toBe(false);
	});

	test("rejects an edge into the start node", () => {
		expect(canConnect({ source: "a", target: "start" }, NODES, [])).toBe(false);
	});

	test("rejects a duplicate edge on the same source handle", () => {
		const edges: PipelineFlowEdge[] = [
			{ id: "a->b", source: "a", target: "b" },
		];
		expect(canConnect({ source: "a", target: "b" }, NODES, edges)).toBe(false);
	});

	test("allows the same source→target from a DIFFERENT branch handle", () => {
		const edges: PipelineFlowEdge[] = [
			{ id: "gate->b", source: "gate", target: "b", sourceHandle: "approved" },
		];
		// Same pair but via the "rejected" handle is a distinct branch — allowed.
		expect(
			canConnect(
				{ source: "gate", target: "b", sourceHandle: "rejected" },
				NODES,
				edges,
			),
		).toBe(true);
	});

	test("treats null and undefined source handles as the same (dup)", () => {
		const edges: PipelineFlowEdge[] = [
			{ id: "a->b", source: "a", target: "b", sourceHandle: undefined },
		];
		expect(
			canConnect(
				{ source: "a", target: "b", sourceHandle: null },
				NODES,
				edges,
			),
		).toBe(false);
	});
});

/**
 * A registry-typed node: the canvas `kind` stays generic (`agent_run`) while the
 * persisted `blockType` is a real registry id, so `getNodeType` resolves its
 * typed ports (mirrors how the catalog renders through the generic node).
 */
function typedNode(id: string, blockType: string): PipelineFlowNode {
	return {
		id,
		type: "pipelineRegistry",
		position: { x: 0, y: 0 },
		data: { blockId: id, kind: "agent_run", blockType, label: id },
	};
}

describe("canConnect — typed-port compatibility", () => {
	const typedNodes: PipelineFlowNode[] = [
		node("start", "start"),
		typedNode("emb", "embedding"),
		typedNode("kr", "knowledge_retrieval"),
		typedNode("cls", "classifier"),
	];

	test("rejects an incompatible typed edge (vector → string)", () => {
		// embedding.out:vector dragged into knowledge_retrieval.in:string.
		expect(
			canConnect(
				{
					source: "emb",
					target: "kr",
					sourceHandle: "out",
					targetHandle: "in",
				},
				typedNodes,
				[],
			),
		).toBe(false);
	});

	test("allows a matching typed edge (string → string)", () => {
		// classifier.out:string → embedding.in:string is an exact match.
		expect(
			canConnect(
				{
					source: "cls",
					target: "emb",
					sourceHandle: "out",
					targetHandle: "in",
				},
				typedNodes,
				[],
			),
		).toBe(true);
	});

	test("allows an `any`/untyped source (start.out → string input)", () => {
		expect(
			canConnect(
				{ source: "start", target: "kr", targetHandle: "in" },
				typedNodes,
				[],
			),
		).toBe(true);
	});
});
