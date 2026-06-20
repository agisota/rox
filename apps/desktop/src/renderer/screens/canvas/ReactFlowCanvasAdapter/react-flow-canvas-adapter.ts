import type {
	CanvasDocument,
	CanvasMutation,
	CanvasMutationBatch,
	CanvasNode,
	CanvasPoint,
	CanvasSize,
} from "@rox/shared/canvas";
import {
	createInverseCanvasMutationBatch,
	rebaseCanvasMutationBatch,
} from "@rox/shared/canvas";
import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

export type RoxCanvasNodeData = {
	canvasNodeId: string;
	nodeType: CanvasNode["type"];
	title: string;
	body?: string;
	refLabel: string;
	tags: string[];
	sourceNode: CanvasNode;
};

export type RoxFlowNode = Node<RoxCanvasNodeData, "roxCanvasNode">;
export type RoxFlowEdge = Edge<{
	canvasEdgeId: string;
	directed: boolean;
}>;

type CreateNodePositionBatchInput = {
	document: CanvasDocument;
	nodeId: string;
	position: CanvasPoint;
	baseVersion: number;
	actorId: string;
};

type CreateConnectNodesBatchInput = {
	document: CanvasDocument;
	sourceNodeId: string;
	targetNodeId: string;
	baseVersion: number;
	actorId: string;
};

type CreateNodeSizeBatchInput = {
	document: CanvasDocument;
	nodeId: string;
	size: CanvasSize;
	baseVersion: number;
	actorId: string;
};

type CreateDeleteElementsBatchInput = {
	document: CanvasDocument;
	nodeIds: string[];
	edgeIds: string[];
	baseVersion: number;
	actorId: string;
};

type CreateSelectionCommandBatchInput = {
	document: CanvasDocument;
	nodeIds: string[];
	baseVersion: number;
	actorId: string;
};

type CreateDuplicateSelectionBatchInput = CreateSelectionCommandBatchInput & {
	createId?: (kind: "node" | "edge", originalId: string) => string;
};

function createRendererBatchBase({
	document,
	baseVersion,
	actorId,
}: {
	document: CanvasDocument;
	baseVersion: number;
	actorId: string;
}): Omit<CanvasMutationBatch, "mutations"> {
	return {
		id: crypto.randomUUID(),
		canvasId: document.id,
		baseVersion,
		createdAt: new Date().toISOString(),
		actor: {
			id: actorId,
			type: "user",
			label: "Canvas renderer",
		},
	};
}

function getNodeTitle(node: CanvasNode): string {
	return node.title ?? node.ref?.preview ?? node.text ?? node.id;
}

function getNodeBody(node: CanvasNode): string | undefined {
	return node.text ?? node.ref?.preview;
}

function getNodeRefLabel(node: CanvasNode): string {
	if (!node.ref) return "CanvasDocument entity";
	return `${node.ref.type} ref · ${node.ref.id}`;
}

function getNodeWidth(node: CanvasNode): number {
	return node.size?.width ?? 288;
}

function getNodeHeight(node: CanvasNode): number {
	return node.size?.height ?? 160;
}

function getSelectedNodes(
	document: CanvasDocument,
	nodeIds: string[],
): CanvasNode[] {
	const selectedIds = new Set(nodeIds);
	const selectedNodes = document.nodes.filter((node) =>
		selectedIds.has(node.id),
	);
	if (selectedNodes.length !== selectedIds.size) {
		throw new Error("Canvas selection contains missing nodes");
	}
	return selectedNodes;
}

function createPositionMutation(
	node: CanvasNode,
	position: CanvasPoint,
): CanvasMutation {
	return {
		type: "node.update",
		nodeId: node.id,
		patch: {
			position,
		},
	};
}

export function toReactFlowNodes(document: CanvasDocument): RoxFlowNode[] {
	return document.nodes.map((node) => ({
		id: node.id,
		type: "roxCanvasNode",
		position: node.position,
		data: {
			canvasNodeId: node.id,
			nodeType: node.type,
			title: getNodeTitle(node),
			body: getNodeBody(node),
			refLabel: getNodeRefLabel(node),
			tags: node.tags,
			sourceNode: node,
		},
		draggable: !node.locked,
		selectable: true,
		deletable: !node.locked,
		style: {
			width: node.size?.width ?? 288,
			height: node.size?.height ?? 160,
		},
	}));
}

export function toReactFlowEdges(document: CanvasDocument): RoxFlowEdge[] {
	return document.edges.map((edge) => ({
		id: edge.id,
		source: edge.from.nodeId,
		target: edge.to.nodeId,
		label: edge.label,
		animated: false,
		data: {
			canvasEdgeId: edge.id,
			directed: edge.directed,
		},
		markerEnd: edge.directed
			? {
					type: MarkerType.ArrowClosed,
					color: edge.color?.value ?? "rgba(125, 211, 252, 0.9)",
				}
			: undefined,
		style: {
			stroke: edge.color?.value ?? "rgba(125, 211, 252, 0.72)",
			strokeWidth: 2,
		},
	}));
}

export function createNodePositionBatch({
	document,
	nodeId,
	position,
	baseVersion,
	actorId,
}: CreateNodePositionBatchInput): CanvasMutationBatch {
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "node.update",
				nodeId,
				patch: {
					position,
				},
			},
		],
	};
}

export function createConnectNodesBatch({
	document,
	sourceNodeId,
	targetNodeId,
	baseVersion,
	actorId,
}: CreateConnectNodesBatchInput): CanvasMutationBatch {
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "edge.add",
				edge: {
					id: `edge-${crypto.randomUUID()}`,
					from: { nodeId: sourceNodeId, side: "auto" },
					to: { nodeId: targetNodeId, side: "auto" },
					directed: true,
					metadata: {},
				},
			},
		],
	};
}

export function createNodeSizeBatch({
	document,
	nodeId,
	size,
	baseVersion,
	actorId,
}: CreateNodeSizeBatchInput): CanvasMutationBatch {
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "node.update",
				nodeId,
				patch: {
					size,
				},
			},
		],
	};
}

export function createDeleteElementsBatch({
	document,
	nodeIds,
	edgeIds,
	baseVersion,
	actorId,
}: CreateDeleteElementsBatchInput): CanvasMutationBatch {
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [
			...edgeIds.map((edgeId) => ({
				type: "edge.delete" as const,
				edgeId,
			})),
			...nodeIds.map((nodeId) => ({
				type: "node.delete" as const,
				nodeId,
			})),
		],
	};
}

export function createAlignLeftBatch({
	document,
	nodeIds,
	baseVersion,
	actorId,
}: CreateSelectionCommandBatchInput): CanvasMutationBatch {
	const selectedNodes = getSelectedNodes(document, nodeIds);
	const left = Math.min(...selectedNodes.map((node) => node.position.x));
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: selectedNodes.map((node) =>
			createPositionMutation(node, {
				x: left,
				y: node.position.y,
			}),
		),
	};
}

export function createDistributeHorizontalBatch({
	document,
	nodeIds,
	baseVersion,
	actorId,
}: CreateSelectionCommandBatchInput): CanvasMutationBatch {
	const selectedNodes = getSelectedNodes(document, nodeIds).sort(
		(a, b) => a.position.x - b.position.x,
	);
	const firstNode = selectedNodes[0];
	const lastNode = selectedNodes.at(-1);
	if (!firstNode || !lastNode || selectedNodes.length < 2) {
		throw new Error("At least two nodes are required for distribution");
	}
	const step =
		(lastNode.position.x - firstNode.position.x) / (selectedNodes.length - 1);
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: selectedNodes.map((node, index) =>
			createPositionMutation(node, {
				x: Math.round(firstNode.position.x + step * index),
				y: node.position.y,
			}),
		),
	};
}

export function createGroupSelectionBatch({
	document,
	nodeIds,
	baseVersion,
	actorId,
}: CreateSelectionCommandBatchInput): CanvasMutationBatch {
	const selectedNodes = getSelectedNodes(document, nodeIds);
	if (selectedNodes.length < 2) {
		throw new Error("At least two nodes are required to create a group");
	}
	const padding = 24;
	const left = Math.min(...selectedNodes.map((node) => node.position.x));
	const top = Math.min(...selectedNodes.map((node) => node.position.y));
	const right = Math.max(
		...selectedNodes.map((node) => node.position.x + getNodeWidth(node)),
	);
	const bottom = Math.max(
		...selectedNodes.map((node) => node.position.y + getNodeHeight(node)),
	);
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "group.add",
				group: {
					id: `group-${crypto.randomUUID()}`,
					title: "Canvas group",
					position: {
						x: left - padding,
						y: top - padding,
					},
					size: {
						width: right - left + padding * 2,
						height: bottom - top + padding * 2,
					},
					collapsed: false,
					nodeIds,
					metadata: {},
				},
			},
		],
	};
}

export function createDuplicateSelectionBatch({
	document,
	nodeIds,
	baseVersion,
	actorId,
	createId = (kind, originalId) =>
		`${kind}-${originalId}-${crypto.randomUUID()}`,
}: CreateDuplicateSelectionBatchInput): CanvasMutationBatch {
	const selectedNodes = getSelectedNodes(document, nodeIds);
	const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
	const duplicateNodeIdByOriginalId = new Map(
		selectedNodes.map((node) => [node.id, createId("node", node.id)]),
	);
	const nodeMutations: CanvasMutation[] = selectedNodes.map((node) => ({
		type: "node.add",
		node: {
			...node,
			id: duplicateNodeIdByOriginalId.get(node.id) ?? createId("node", node.id),
			position: {
				x: node.position.x + 40,
				y: node.position.y + 40,
			},
		},
	}));
	const edgeMutations: CanvasMutation[] = document.edges
		.filter(
			(edge) =>
				selectedNodeIds.has(edge.from.nodeId) &&
				selectedNodeIds.has(edge.to.nodeId),
		)
		.map((edge) => ({
			type: "edge.add",
			edge: {
				...edge,
				id: createId("edge", edge.id),
				from: {
					...edge.from,
					nodeId:
						duplicateNodeIdByOriginalId.get(edge.from.nodeId) ??
						edge.from.nodeId,
				},
				to: {
					...edge.to,
					nodeId:
						duplicateNodeIdByOriginalId.get(edge.to.nodeId) ?? edge.to.nodeId,
				},
			},
		}));
	return {
		...createRendererBatchBase({ document, baseVersion, actorId }),
		mutations: [...nodeMutations, ...edgeMutations],
	};
}

export { createInverseCanvasMutationBatch, rebaseCanvasMutationBatch };
