import { describe, expect, it } from "bun:test";
import { sampleCanvasDocument } from "@rox/shared/canvas";
import {
	createAddTextNodeBatch,
	createConnectNodesBatch,
	createDeleteElementsBatch,
	createDuplicateSelectionBatch,
	createGroupSelectionBatch,
	createToggleNodeFlagBatch,
	isValidCanvasConnection,
	type RoxFlowEdge,
	toReactFlowEdges,
	toReactFlowNodes,
} from "./canvasFlowAdapter";

const baseVersion = 3;
const actorId = "renderer";

describe("toReactFlowNodes", () => {
	it("projects canvas nodes with type, ref preview, and accent data", () => {
		const nodes = toReactFlowNodes(sampleCanvasDocument);
		expect(nodes).toHaveLength(2);
		const session = nodes.find((node) => node.id === "node-session");
		expect(session?.type).toBe("roxCanvasNode");
		expect(session?.data.nodeType).toBe("chat-session");
		expect(session?.data.refType).toBe("session");
		expect(session?.data.refLabel).toContain("session-1");
		expect(session?.data.accent.length).toBeGreaterThan(0);
		expect(session?.style?.width).toBe(300);
	});

	it("marks locked nodes as non-draggable and non-deletable", () => {
		const lockedDocument = {
			...sampleCanvasDocument,
			nodes: sampleCanvasDocument.nodes.map((node) =>
				node.id === "node-note" ? { ...node, locked: true } : node,
			),
		};
		const nodes = toReactFlowNodes(lockedDocument);
		const note = nodes.find((node) => node.id === "node-note");
		expect(note?.draggable).toBe(false);
		expect(note?.deletable).toBe(false);
		expect(note?.data.locked).toBe(true);
	});

	it("collapses node height when collapsed flag is set", () => {
		const collapsedDocument = {
			...sampleCanvasDocument,
			nodes: sampleCanvasDocument.nodes.map((node) =>
				node.id === "node-note" ? { ...node, collapsed: true } : node,
			),
		};
		const nodes = toReactFlowNodes(collapsedDocument);
		const note = nodes.find((node) => node.id === "node-note");
		expect(note?.data.collapsed).toBe(true);
		expect(Number(note?.style?.height)).toBeLessThan(100);
	});
});

describe("toReactFlowEdges", () => {
	it("projects directed edges with smoothstep type and arrow marker", () => {
		const edges = toReactFlowEdges(sampleCanvasDocument);
		expect(edges).toHaveLength(1);
		const edge = edges[0];
		expect(edge?.type).toBe("smoothstep");
		expect(edge?.source).toBe("node-session");
		expect(edge?.target).toBe("node-note");
		expect(edge?.markerEnd).toBeDefined();
	});
});

describe("isValidCanvasConnection", () => {
	const edges: RoxFlowEdge[] = [
		{
			id: "e1",
			source: "a",
			target: "b",
			data: { canvasEdgeId: "e1", directed: true },
		},
	];

	it("rejects self-loops", () => {
		expect(
			isValidCanvasConnection(
				{ source: "a", target: "a", sourceHandle: null, targetHandle: null },
				edges,
			),
		).toBe(false);
	});

	it("rejects duplicate source->target edges", () => {
		expect(
			isValidCanvasConnection(
				{ source: "a", target: "b", sourceHandle: null, targetHandle: null },
				edges,
			),
		).toBe(false);
	});

	it("allows a new distinct connection", () => {
		expect(
			isValidCanvasConnection(
				{ source: "b", target: "a", sourceHandle: null, targetHandle: null },
				edges,
			),
		).toBe(true);
	});
});

describe("mutation batch builders", () => {
	it("creates a text node add batch at the given position", () => {
		const batch = createAddTextNodeBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			position: { x: 12.6, y: 40.2 },
		});
		expect(batch.canvasId).toBe(sampleCanvasDocument.id);
		expect(batch.baseVersion).toBe(baseVersion);
		expect(batch.mutations).toHaveLength(1);
		const mutation = batch.mutations[0];
		expect(mutation?.type).toBe("node.add");
		if (mutation?.type === "node.add") {
			expect(mutation.node.type).toBe("text");
			expect(mutation.node.position).toEqual({ x: 13, y: 40 });
		}
	});

	it("connects two nodes with a directed edge mutation", () => {
		const batch = createConnectNodesBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			sourceNodeId: "node-session",
			targetNodeId: "node-note",
		});
		const mutation = batch.mutations[0];
		expect(mutation?.type).toBe("edge.add");
		if (mutation?.type === "edge.add") {
			expect(mutation.edge.directed).toBe(true);
			expect(mutation.edge.from.nodeId).toBe("node-session");
			expect(mutation.edge.to.nodeId).toBe("node-note");
		}
	});

	it("deletes edges before nodes so reference integrity holds", () => {
		const batch = createDeleteElementsBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			nodeIds: ["node-note"],
			edgeIds: ["edge-session-note"],
		});
		expect(batch.mutations[0]?.type).toBe("edge.delete");
		expect(batch.mutations[1]?.type).toBe("node.delete");
	});

	it("toggles node flags through a node.update patch", () => {
		const batch = createToggleNodeFlagBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			nodeId: "node-note",
			patch: { locked: true },
		});
		const mutation = batch.mutations[0];
		expect(mutation?.type).toBe("node.update");
		if (mutation?.type === "node.update") {
			expect(mutation.patch.locked).toBe(true);
		}
	});

	it("groups a multi-node selection into one group mutation", () => {
		const batch = createGroupSelectionBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			nodeIds: ["node-session", "node-note"],
		});
		const mutation = batch.mutations[0];
		expect(mutation?.type).toBe("group.add");
		if (mutation?.type === "group.add") {
			expect(mutation.group.nodeIds).toEqual(["node-session", "node-note"]);
			expect(mutation.group.size.width).toBeGreaterThan(0);
		}
	});

	it("duplicates selected nodes and their internal edges with fresh ids", () => {
		const batch = createDuplicateSelectionBatch({
			document: sampleCanvasDocument,
			baseVersion,
			actorId,
			nodeIds: ["node-session", "node-note"],
			createId: (kind, originalId) => `${kind}-copy-${originalId}`,
		});
		const nodeAdds = batch.mutations.filter((m) => m.type === "node.add");
		const edgeAdds = batch.mutations.filter((m) => m.type === "edge.add");
		expect(nodeAdds).toHaveLength(2);
		expect(edgeAdds).toHaveLength(1);
		const edgeMutation = edgeAdds[0];
		if (edgeMutation?.type === "edge.add") {
			expect(edgeMutation.edge.from.nodeId).toBe("node-copy-node-session");
			expect(edgeMutation.edge.to.nodeId).toBe("node-copy-node-note");
		}
	});

	it("throws when a selection references a missing node", () => {
		expect(() =>
			createGroupSelectionBatch({
				document: sampleCanvasDocument,
				baseVersion,
				actorId,
				nodeIds: ["node-session", "ghost"],
			}),
		).toThrow();
	});
});
