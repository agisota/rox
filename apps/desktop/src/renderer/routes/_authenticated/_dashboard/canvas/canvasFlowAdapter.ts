import type {
	CanvasDocument,
	CanvasMutation,
	CanvasMutationBatch,
	CanvasNode,
	CanvasPoint,
	CanvasSize,
} from "@rox/shared/canvas";
import type { Connection, Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { getCanvasNodeMeta } from "./canvasNodeMeta";
import {
	type CanvasRefDragPayload,
	canvasNodeTypeForRef,
} from "./canvasRefDrag";

/** Terracotta accent used for directed edges + arrowheads. */
export const CANVAS_EDGE_COLOR = "var(--sidebar-primary)";

export interface RoxCanvasNodeData {
	canvasNodeId: string;
	nodeType: CanvasNode["type"];
	title: string;
	body?: string;
	refType?: string;
	refLabel?: string;
	refPreview?: string;
	/** Full node ref, forwarded so the live preview layer can resolve content. */
	nodeRef?: CanvasNode["ref"];
	/** Inline node text, used as the cache-first note fallback. */
	nodeText?: string;
	/** Workspace the canvas belongs to; needed to query live ref content. */
	workspaceId?: string;
	tags: string[];
	locked: boolean;
	collapsed: boolean;
	accent: string;
	[key: string]: unknown;
}

export type RoxFlowNode = Node<RoxCanvasNodeData, "roxCanvasNode">;
export type RoxFlowEdge = Edge<{ canvasEdgeId: string; directed: boolean }>;

const DEFAULT_NODE_WIDTH = 288;
const DEFAULT_NODE_HEIGHT = 168;
const COLLAPSED_NODE_HEIGHT = 56;

function getNodeTitle(node: CanvasNode): string {
	return node.title ?? node.ref?.preview ?? node.text ?? "Без названия";
}

function getNodeBody(node: CanvasNode): string | undefined {
	if (node.text) return node.text;
	return node.ref?.preview;
}

function getNodeWidth(node: CanvasNode): number {
	return node.size?.width ?? DEFAULT_NODE_WIDTH;
}

function getNodeHeight(node: CanvasNode): number {
	if (node.collapsed) return COLLAPSED_NODE_HEIGHT;
	return node.size?.height ?? DEFAULT_NODE_HEIGHT;
}

export function toReactFlowNodes(
	document: CanvasDocument,
	workspaceId?: string,
): RoxFlowNode[] {
	return document.nodes.map((node) => {
		const meta = getCanvasNodeMeta(node.type);
		return {
			id: node.id,
			type: "roxCanvasNode",
			position: node.position,
			draggable: !node.locked,
			selectable: true,
			deletable: !node.locked,
			data: {
				canvasNodeId: node.id,
				nodeType: node.type,
				title: getNodeTitle(node),
				body: getNodeBody(node),
				refType: node.ref?.type,
				refLabel: node.ref ? `${node.ref.type} · ${node.ref.id}` : undefined,
				refPreview: node.ref?.preview,
				nodeRef: node.ref,
				nodeText: node.text,
				workspaceId,
				tags: node.tags,
				locked: node.locked,
				collapsed: node.collapsed,
				accent: meta.accent,
			},
			style: {
				width: getNodeWidth(node),
				height: getNodeHeight(node),
			},
		};
	});
}

export function toReactFlowEdges(document: CanvasDocument): RoxFlowEdge[] {
	return document.edges.map((edge) => {
		const stroke = edge.color?.value ?? CANVAS_EDGE_COLOR;
		return {
			id: edge.id,
			source: edge.from.nodeId,
			target: edge.to.nodeId,
			label: edge.label,
			type: "smoothstep",
			animated: false,
			data: { canvasEdgeId: edge.id, directed: edge.directed },
			markerEnd: edge.directed
				? { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 }
				: undefined,
			style: { stroke, strokeWidth: 1.75 },
		};
	});
}

/**
 * Connection guard borrowed from the React Flow `isValidConnection` example:
 * reject self-loops and duplicate source->target edges. Returns true when the
 * edge may be created.
 */
export function isValidCanvasConnection(
	connection: Connection | RoxFlowEdge,
	edges: RoxFlowEdge[],
): boolean {
	const source = connection.source;
	const target = connection.target;
	if (!source || !target) return false;
	if (source === target) return false;
	return !edges.some(
		(edge) => edge.source === source && edge.target === target,
	);
}

interface BatchBaseInput {
	document: CanvasDocument;
	baseVersion: number;
	actorId: string;
}

function createBatchBase({
	document,
	baseVersion,
	actorId,
}: BatchBaseInput): Omit<CanvasMutationBatch, "mutations"> {
	return {
		id: crypto.randomUUID(),
		canvasId: document.id,
		baseVersion,
		createdAt: new Date().toISOString(),
		actor: { id: actorId, type: "user", label: "Canvas renderer" },
	};
}

function getSelectedNodes(
	document: CanvasDocument,
	nodeIds: string[],
): CanvasNode[] {
	const wanted = new Set(nodeIds);
	const selected = document.nodes.filter((node) => wanted.has(node.id));
	if (selected.length !== wanted.size) {
		throw new Error("Canvas selection contains missing nodes");
	}
	return selected;
}

function positionMutation(
	node: CanvasNode,
	position: CanvasPoint,
): CanvasMutation {
	return { type: "node.update", nodeId: node.id, patch: { position } };
}

export function createAddTextNodeBatch({
	document,
	baseVersion,
	actorId,
	position,
	title = "Текстовая карточка",
	text = "Новый узел холста.",
}: BatchBaseInput & {
	position: CanvasPoint;
	title?: string;
	text?: string;
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "node.add",
				node: {
					id: `node-${crypto.randomUUID()}`,
					type: "text",
					position: { x: Math.round(position.x), y: Math.round(position.y) },
					size: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
					title,
					text,
					tags: [],
					locked: false,
					collapsed: false,
					metadata: {},
				},
			},
		],
	};
}

/**
 * Build a `node.add` batch for a workspace entity dropped onto the canvas.
 * Mirrors {@link createAddTextNodeBatch} but produces a ref-node so live
 * content and double-click-open work immediately: `ref.type`/`ref.id` come from
 * the {@link CanvasRefDragPayload} and the node `type` is derived via
 * `canvasNodeTypeForRef`.
 */
export function createAddRefNodeBatch({
	document,
	baseVersion,
	actorId,
	position,
	payload,
}: BatchBaseInput & {
	position: CanvasPoint;
	payload: CanvasRefDragPayload;
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "node.add",
				node: {
					id: `node-${crypto.randomUUID()}`,
					type: canvasNodeTypeForRef(payload.refType),
					position: { x: Math.round(position.x), y: Math.round(position.y) },
					size: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
					title: payload.label,
					ref: {
						type: payload.refType,
						id: payload.refId,
						preview: payload.label,
						...(payload.path ? { path: payload.path } : {}),
					},
					tags: [],
					locked: false,
					collapsed: false,
					metadata: {},
				},
			},
		],
	};
}

export function createNodePositionBatch({
	document,
	baseVersion,
	actorId,
	nodeId,
	position,
}: BatchBaseInput & {
	nodeId: string;
	position: CanvasPoint;
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [{ type: "node.update", nodeId, patch: { position } }],
	};
}

export function createNodeSizeBatch({
	document,
	baseVersion,
	actorId,
	nodeId,
	size,
}: BatchBaseInput & {
	nodeId: string;
	size: CanvasSize;
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [{ type: "node.update", nodeId, patch: { size } }],
	};
}

export function createToggleNodeFlagBatch({
	document,
	baseVersion,
	actorId,
	nodeId,
	patch,
}: BatchBaseInput & {
	nodeId: string;
	patch: { locked?: boolean; collapsed?: boolean };
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [{ type: "node.update", nodeId, patch }],
	};
}

export function createConnectNodesBatch({
	document,
	baseVersion,
	actorId,
	sourceNodeId,
	targetNodeId,
}: BatchBaseInput & {
	sourceNodeId: string;
	targetNodeId: string;
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
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

export function createDeleteElementsBatch({
	document,
	baseVersion,
	actorId,
	nodeIds,
	edgeIds,
}: BatchBaseInput & {
	nodeIds: string[];
	edgeIds: string[];
}): CanvasMutationBatch {
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [
			...edgeIds.map((edgeId) => ({ type: "edge.delete" as const, edgeId })),
			...nodeIds.map((nodeId) => ({ type: "node.delete" as const, nodeId })),
		],
	};
}

export function createAlignLeftBatch({
	document,
	baseVersion,
	actorId,
	nodeIds,
}: BatchBaseInput & { nodeIds: string[] }): CanvasMutationBatch {
	const selected = getSelectedNodes(document, nodeIds);
	const left = Math.min(...selected.map((node) => node.position.x));
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: selected.map((node) =>
			positionMutation(node, { x: left, y: node.position.y }),
		),
	};
}

export function createDistributeHorizontalBatch({
	document,
	baseVersion,
	actorId,
	nodeIds,
}: BatchBaseInput & { nodeIds: string[] }): CanvasMutationBatch {
	const selected = getSelectedNodes(document, nodeIds).sort(
		(a, b) => a.position.x - b.position.x,
	);
	const first = selected[0];
	const last = selected.at(-1);
	if (!first || !last || selected.length < 2) {
		throw new Error("At least two nodes are required for distribution");
	}
	const step = (last.position.x - first.position.x) / (selected.length - 1);
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: selected.map((node, index) =>
			positionMutation(node, {
				x: Math.round(first.position.x + step * index),
				y: node.position.y,
			}),
		),
	};
}

export function createGroupSelectionBatch({
	document,
	baseVersion,
	actorId,
	nodeIds,
}: BatchBaseInput & { nodeIds: string[] }): CanvasMutationBatch {
	const selected = getSelectedNodes(document, nodeIds);
	if (selected.length < 2) {
		throw new Error("At least two nodes are required to create a group");
	}
	const padding = 24;
	const left = Math.min(...selected.map((node) => node.position.x));
	const top = Math.min(...selected.map((node) => node.position.y));
	const right = Math.max(
		...selected.map((node) => node.position.x + getNodeWidth(node)),
	);
	const bottom = Math.max(
		...selected.map((node) => node.position.y + getNodeHeight(node)),
	);
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [
			{
				type: "group.add",
				group: {
					id: `group-${crypto.randomUUID()}`,
					title: "Группа холста",
					position: { x: left - padding, y: top - padding },
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
	baseVersion,
	actorId,
	nodeIds,
	createId = (kind, originalId) =>
		`${kind}-${originalId}-${crypto.randomUUID()}`,
}: BatchBaseInput & {
	nodeIds: string[];
	createId?: (kind: "node" | "edge", originalId: string) => string;
}): CanvasMutationBatch {
	const selected = getSelectedNodes(document, nodeIds);
	const selectedIds = new Set(selected.map((node) => node.id));
	const newIdByOriginal = new Map(
		selected.map((node) => [node.id, createId("node", node.id)]),
	);
	const nodeMutations: CanvasMutation[] = selected.map((node) => ({
		type: "node.add",
		node: {
			...node,
			id: newIdByOriginal.get(node.id) ?? createId("node", node.id),
			position: { x: node.position.x + 40, y: node.position.y + 40 },
		},
	}));
	const edgeMutations: CanvasMutation[] = document.edges
		.filter(
			(edge) =>
				selectedIds.has(edge.from.nodeId) && selectedIds.has(edge.to.nodeId),
		)
		.map((edge) => ({
			type: "edge.add",
			edge: {
				...edge,
				id: createId("edge", edge.id),
				from: {
					...edge.from,
					nodeId: newIdByOriginal.get(edge.from.nodeId) ?? edge.from.nodeId,
				},
				to: {
					...edge.to,
					nodeId: newIdByOriginal.get(edge.to.nodeId) ?? edge.to.nodeId,
				},
			},
		}));
	return {
		...createBatchBase({ document, baseVersion, actorId }),
		mutations: [...nodeMutations, ...edgeMutations],
	};
}
