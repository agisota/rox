import { describe, expect, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";
import {
	flowToState,
	readRoleSlug,
	stateToEdges,
	stateToNodes,
} from "./graph-adapter";

const baseState = {
	id: "pipeline-1",
	blocks: {
		start: {
			type: "start",
			name: "Старт",
			position: { x: 10, y: 20 },
		},
		improve: {
			type: "agent_run",
			name: "Промпт-инженер",
			position: { x: 280, y: 20 },
			subBlocks: { roleSlug: "prompt-improver", temperature: 0.2 },
			metadata: { stable: true },
		},
		custom: {
			type: "skill_call:legacy",
			name: "Legacy skill",
			position: { x: 560, y: 20 },
		},
	},
	edges: [
		{ id: "e-start-improve", source: "start", target: "improve" },
		{ source: "improve", target: "custom", sourceHandle: "success" },
	],
	variables: { seed: { type: "string", value: "message" } },
	loops: { retry: { nodes: ["improve"], maxIterations: 2 } },
	parallels: {},
	metadata: { name: "Spec pipeline" },
} satisfies RoxWorkflowState;

describe("pipeline graph adapter", () => {
	test("maps persisted blocks and edges into canvas nodes", () => {
		const nodes = stateToNodes(baseState);
		const edges = stateToEdges(baseState);

		expect(nodes).toHaveLength(3);
		expect(nodes.find((node) => node.id === "start")).toMatchObject({
			type: "pipelineStart",
			position: { x: 10, y: 20 },
			data: { kind: "start", label: "Старт" },
		});
		expect(nodes.find((node) => node.id === "improve")).toMatchObject({
			type: "pipeline_agent_run",
			data: {
				kind: "agent_run",
				roleSlug: "prompt-improver",
				subBlocks: { roleSlug: "prompt-improver", temperature: 0.2 },
			},
		});
		expect(nodes.find((node) => node.id === "custom")).toMatchObject({
			type: "pipeline_agent_run",
			data: {
				kind: "agent_run",
				blockType: "skill_call:legacy",
				label: "Legacy skill",
			},
		});
		expect(edges).toEqual([
			{
				id: "e-start-improve",
				source: "start",
				target: "improve",
				sourceHandle: null,
				targetHandle: null,
				type: "animated",
			},
			{
				id: "improve->custom-1",
				source: "improve",
				target: "custom",
				sourceHandle: "success",
				targetHandle: null,
				type: "animated",
			},
		]);
	});

	test("round-trips edited canvas nodes while preserving workflow metadata", () => {
		const nodes = stateToNodes(baseState).map((node) =>
			node.id === "improve"
				? {
						...node,
						position: { x: 320, y: 64 },
						data: {
							...node.data,
							label: "Улучшатель",
							roleSlug: "critic",
						},
					}
				: node,
		);
		const edges = [
			{
				id: "e-improve-custom",
				source: "improve",
				target: "custom",
				sourceHandle: null,
				targetHandle: "input",
				type: "animated",
			},
		];

		const next = flowToState(baseState, nodes, edges);

		expect(next.id).toBe("pipeline-1");
		expect(next.variables).toEqual(baseState.variables);
		expect(next.loops).toEqual(baseState.loops);
		expect(next.parallels).toEqual(baseState.parallels);
		expect(next.metadata).toEqual(baseState.metadata);
		expect(next.blocks.improve).toMatchObject({
			type: "agent_run",
			name: "Улучшатель",
			position: { x: 320, y: 64 },
			subBlocks: { roleSlug: "critic", temperature: 0.2 },
			metadata: { stable: true },
		});
		expect(next.blocks.custom?.type).toBe("skill_call:legacy");
		expect(next.edges).toEqual([
			{
				id: "e-improve-custom",
				source: "improve",
				target: "custom",
				targetHandle: "input",
			},
		]);
	});

	test("preserves unsupported persisted block types on a position-only save", () => {
		const state = {
			...baseState,
			blocks: {
				...baseState.blocks,
				condition: {
					type: "condition",
					name: "Branch",
					position: { x: 840, y: 20 },
					subBlocks: { expression: "ok" },
				},
			},
		} satisfies RoxWorkflowState;

		const nodes = stateToNodes(state).map((node) =>
			node.id === "custom"
				? { ...node, position: { x: 600, y: 80 } }
				: node.id === "condition"
					? { ...node, position: { x: 900, y: 80 } }
					: node,
		);
		const next = flowToState(state, nodes, stateToEdges(state));

		expect(next.blocks.custom).toMatchObject({
			type: "skill_call:legacy",
			position: { x: 600, y: 80 },
		});
		// A non-rendered blockType (condition→agent_run kind) is NOT rewritten.
		expect(next.blocks.condition).toMatchObject({
			type: "condition",
			position: { x: 900, y: 80 },
			subBlocks: { expression: "ok" },
		});
	});

	test("round-trips arbitrary inspector subBlocks keys losslessly", () => {
		// Simulate the inspector writing per-node config into subBlocks, then a
		// canvas drag re-serializing the node. All keys must survive flowToState.
		const enriched = {
			...baseState,
			blocks: {
				...baseState.blocks,
				improve: {
					...baseState.blocks.improve,
					subBlocks: {
						roleSlug: "prompt-improver",
						maxIterations: 5,
						approvalMessage: "Подтвердите выпуск",
						modelOverride: "gpt-5",
						maxTurns: 4,
						temperature: 0.7,
					},
				},
			},
		} satisfies RoxWorkflowState;

		const nodes = stateToNodes(enriched);
		const next = flowToState(enriched, nodes, stateToEdges(enriched));

		expect(next.blocks.improve.subBlocks).toEqual({
			roleSlug: "prompt-improver",
			maxIterations: 5,
			approvalMessage: "Подтвердите выпуск",
			modelOverride: "gpt-5",
			maxTurns: 4,
			temperature: 0.7,
		});
		expect(next.blocks.improve.name).toBe("Промпт-инженер");
	});

	test("reads role slugs only from non-empty string subBlocks", () => {
		expect(readRoleSlug(baseState.blocks.improve)).toBe("prompt-improver");
		expect(
			readRoleSlug({ type: "agent_run", subBlocks: { roleSlug: "" } }),
		).toBe(undefined);
		expect(
			readRoleSlug({ type: "agent_run", subBlocks: { roleSlug: 42 } }),
		).toBe(undefined);
	});
});
