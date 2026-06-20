import { describe, expect, test } from "bun:test";
import type { CanvasDocument } from "@rox/shared/canvas";
import {
	createAlignLeftBatch,
	createConnectNodesBatch,
	createDeleteElementsBatch,
	createDistributeHorizontalBatch,
	createDuplicateSelectionBatch,
	createGroupSelectionBatch,
	createInverseCanvasMutationBatch,
	createNodePositionBatch,
	createNodeSizeBatch,
	rebaseCanvasMutationBatch,
	toReactFlowEdges,
	toReactFlowNodes,
} from "./react-flow-canvas-adapter";

const document = {
	version: 1,
	id: "canvas-a",
	workspaceId: "workspace-a",
	title: "Renderer adapter test canvas",
	nodes: [
		{
			id: "node-a",
			type: "text",
			position: { x: 12, y: 34 },
			size: { width: 280, height: 160 },
			title: "Source card",
			text: "Source text",
			tags: [],
			locked: false,
			collapsed: false,
			metadata: {},
		},
		{
			id: "node-b",
			type: "note",
			position: { x: 420, y: 210 },
			size: { width: 320, height: 180 },
			ref: {
				type: "note",
				id: "note-b",
				workspaceId: "workspace-a",
				preview: "Linked note preview",
			},
			tags: ["research"],
			locked: false,
			collapsed: false,
			metadata: {},
		},
	],
	edges: [
		{
			id: "edge-a-b",
			from: { nodeId: "node-a", side: "right" },
			to: { nodeId: "node-b", side: "left" },
			label: "supports",
			directed: true,
			metadata: {},
		},
	],
	groups: [],
	tags: [],
	createdAt: "2026-06-17T00:00:00.000Z",
	updatedAt: "2026-06-17T00:00:00.000Z",
	metadata: {},
} satisfies CanvasDocument;

const threeNodeDocument = {
	...document,
	nodes: [
		...document.nodes,
		{
			id: "node-c",
			type: "task",
			position: { x: 780, y: 90 },
			size: { width: 240, height: 140 },
			title: "Task card",
			tags: [],
			locked: false,
			collapsed: false,
			metadata: {},
		},
	],
} satisfies CanvasDocument;

describe("React Flow canvas adapter", () => {
	test("projects canonical CanvasDocument nodes into renderer nodes without losing source entity data", () => {
		const nodes = toReactFlowNodes(document);

		expect(nodes).toHaveLength(2);
		expect(nodes[0]).toMatchObject({
			id: "node-a",
			type: "roxCanvasNode",
			position: { x: 12, y: 34 },
			data: {
				canvasNodeId: "node-a",
				nodeType: "text",
				title: "Source card",
				body: "Source text",
				refLabel: "CanvasDocument entity",
			},
		});
		expect(nodes[0]?.style).toMatchObject({
			width: 280,
			height: 160,
		});
		expect(nodes[1]?.data).toMatchObject({
			canvasNodeId: "node-b",
			nodeType: "note",
			title: "Linked note preview",
			refLabel: "note ref · note-b",
		});
	});

	test("projects canonical CanvasDocument edges into directed renderer edges", () => {
		const edges = toReactFlowEdges(document);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			id: "edge-a-b",
			source: "node-a",
			target: "node-b",
			label: "supports",
			animated: false,
		});
	});

	test("turns node drag stops into CanvasMutation batches instead of mutating renderer state as truth", () => {
		const batch = createNodePositionBatch({
			document,
			nodeId: "node-a",
			position: { x: 100, y: 120 },
			baseVersion: 7,
			actorId: "renderer-test",
		});

		expect(batch.canvasId).toBe("canvas-a");
		expect(batch.baseVersion).toBe(7);
		expect(batch.mutations).toEqual([
			{
				type: "node.update",
				nodeId: "node-a",
				patch: {
					position: { x: 100, y: 120 },
				},
			},
		]);
	});

	test("turns node resizes into CanvasMutation batches instead of renderer-owned dimensions", () => {
		const batch = createNodeSizeBatch({
			document,
			nodeId: "node-b",
			size: { width: 360, height: 220 },
			baseVersion: 10,
			actorId: "renderer-test",
		});

		expect(batch.canvasId).toBe("canvas-a");
		expect(batch.baseVersion).toBe(10);
		expect(batch.mutations).toEqual([
			{
				type: "node.update",
				nodeId: "node-b",
				patch: {
					size: { width: 360, height: 220 },
				},
			},
		]);
	});

	test("turns renderer connections into directed edge add mutations", () => {
		const batch = createConnectNodesBatch({
			document,
			sourceNodeId: "node-a",
			targetNodeId: "node-b",
			baseVersion: 8,
			actorId: "renderer-test",
		});

		expect(batch.canvasId).toBe("canvas-a");
		expect(batch.baseVersion).toBe(8);
		expect(batch.mutations).toHaveLength(1);
		expect(batch.mutations[0]).toMatchObject({
			type: "edge.add",
			edge: {
				from: { nodeId: "node-a", side: "auto" },
				to: { nodeId: "node-b", side: "auto" },
				directed: true,
			},
		});
	});

	test("turns renderer deletes into canonical delete mutations", () => {
		const batch = createDeleteElementsBatch({
			document,
			nodeIds: ["node-a"],
			edgeIds: ["edge-a-b"],
			baseVersion: 9,
			actorId: "renderer-test",
		});

		expect(batch.canvasId).toBe("canvas-a");
		expect(batch.baseVersion).toBe(9);
		expect(batch.mutations).toEqual([
			{ type: "edge.delete", edgeId: "edge-a-b" },
			{ type: "node.delete", nodeId: "node-a" },
		]);
	});

	test("creates align-left mutations for selected nodes", () => {
		const batch = createAlignLeftBatch({
			document,
			nodeIds: ["node-a", "node-b"],
			baseVersion: 11,
			actorId: "renderer-test",
		});

		expect(batch.mutations).toEqual([
			{
				type: "node.update",
				nodeId: "node-a",
				patch: { position: { x: 12, y: 34 } },
			},
			{
				type: "node.update",
				nodeId: "node-b",
				patch: { position: { x: 12, y: 210 } },
			},
		]);
	});

	test("creates horizontal distribution mutations for selected nodes", () => {
		const batch = createDistributeHorizontalBatch({
			document: threeNodeDocument,
			nodeIds: ["node-c", "node-a", "node-b"],
			baseVersion: 12,
			actorId: "renderer-test",
		});

		expect(batch.mutations).toEqual([
			{
				type: "node.update",
				nodeId: "node-a",
				patch: { position: { x: 12, y: 34 } },
			},
			{
				type: "node.update",
				nodeId: "node-b",
				patch: { position: { x: 396, y: 210 } },
			},
			{
				type: "node.update",
				nodeId: "node-c",
				patch: { position: { x: 780, y: 90 } },
			},
		]);
	});

	test("creates a group mutation around selected nodes", () => {
		const batch = createGroupSelectionBatch({
			document,
			nodeIds: ["node-a", "node-b"],
			baseVersion: 13,
			actorId: "renderer-test",
		});

		expect(batch.mutations).toHaveLength(1);
		expect(batch.mutations[0]).toMatchObject({
			type: "group.add",
			group: {
				title: "Canvas group",
				position: { x: -12, y: 10 },
				size: { width: 776, height: 404 },
				nodeIds: ["node-a", "node-b"],
				collapsed: false,
				metadata: {},
			},
		});
	});

	test("creates duplicate mutations for selected nodes and their internal edges", () => {
		const batch = createDuplicateSelectionBatch({
			document,
			nodeIds: ["node-a", "node-b"],
			baseVersion: 14,
			actorId: "renderer-test",
			createId: (kind, originalId) => `copy-${kind}-${originalId}`,
		});

		expect(batch.mutations).toEqual([
			{
				type: "node.add",
				node: {
					...document.nodes[0],
					id: "copy-node-node-a",
					position: { x: 52, y: 74 },
				},
			},
			{
				type: "node.add",
				node: {
					...document.nodes[1],
					id: "copy-node-node-b",
					position: { x: 460, y: 250 },
				},
			},
			{
				type: "edge.add",
				edge: {
					...document.edges[0],
					id: "copy-edge-edge-a-b",
					from: { nodeId: "copy-node-node-a", side: "right" },
					to: { nodeId: "copy-node-node-b", side: "left" },
				},
			},
		]);
	});

	test("creates inverse batches for node position changes", () => {
		const forwardBatch = createNodePositionBatch({
			document,
			nodeId: "node-a",
			position: { x: 220, y: 240 },
			baseVersion: 7,
			actorId: "renderer-test",
		});

		const inverseBatch = createInverseCanvasMutationBatch({
			document,
			batch: forwardBatch,
			baseVersion: 8,
			actorId: "renderer-undo",
			createId: () => "undo-batch",
			now: () => "2026-06-17T00:00:01.000Z",
		});

		expect(inverseBatch).toMatchObject({
			id: "undo-batch",
			canvasId: document.id,
			baseVersion: 8,
			actor: {
				id: "renderer-undo",
				type: "user",
			},
			mutations: [
				{
					type: "node.update",
					nodeId: "node-a",
					patch: {
						position: { x: 12, y: 34 },
					},
				},
			],
		});
	});

	test("restores incident edges when inverting a node delete batch", () => {
		const forwardBatch = createDeleteElementsBatch({
			document,
			nodeIds: ["node-a"],
			edgeIds: [],
			baseVersion: 7,
			actorId: "renderer-test",
		});

		const inverseBatch = createInverseCanvasMutationBatch({
			document,
			batch: forwardBatch,
			baseVersion: 8,
			actorId: "renderer-undo",
			createId: () => "undo-delete-batch",
			now: () => "2026-06-17T00:00:01.000Z",
		});

		expect(inverseBatch.mutations).toEqual([
			{
				type: "node.add",
				node: document.nodes[0],
			},
			{
				type: "edge.add",
				edge: document.edges[0],
			},
		]);
	});

	test("rebases stored redo batches onto the current document revision", () => {
		const forwardBatch = createNodePositionBatch({
			document,
			nodeId: "node-a",
			position: { x: 220, y: 240 },
			baseVersion: 7,
			actorId: "renderer-test",
		});

		const rebasedBatch = rebaseCanvasMutationBatch({
			batch: forwardBatch,
			baseVersion: 42,
			actorId: "renderer-redo",
			createId: () => "redo-batch",
			now: () => "2026-06-17T00:00:02.000Z",
		});

		expect(rebasedBatch).toEqual({
			...forwardBatch,
			id: "redo-batch",
			baseVersion: 42,
			createdAt: "2026-06-17T00:00:02.000Z",
			actor: {
				id: "renderer-redo",
				type: "user",
				label: "Canvas renderer",
			},
		});
	});
});
