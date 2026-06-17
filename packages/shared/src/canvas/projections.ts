import type { CanvasDocument, CanvasEdge, CanvasNode } from "./schema";

export interface CanvasRendererNodeProjection {
	id: string;
	type: string;
	position: { x: number; y: number };
	size?: { width: number; height: number };
	title?: string;
	color?: string;
	selected?: boolean;
	entityRef?: {
		type: string;
		id: string;
		workspaceId?: string;
	};
}

export interface CanvasRendererEdgeProjection {
	id: string;
	sourceNodeId: string;
	targetNodeId: string;
	sourceSide: string;
	targetSide: string;
	label?: string;
	directed: boolean;
	color?: string;
}

export interface CanvasRendererProjection {
	id: string;
	title: string;
	nodes: CanvasRendererNodeProjection[];
	edges: CanvasRendererEdgeProjection[];
	groups: Array<{
		id: string;
		title?: string;
		nodeIds: string[];
		position: { x: number; y: number };
		size: { width: number; height: number };
	}>;
}

function projectNode(node: CanvasNode): CanvasRendererNodeProjection {
	return {
		id: node.id,
		type: node.type,
		position: node.position,
		size: node.size,
		title: node.title ?? node.text,
		color: node.color?.value ?? node.color?.key,
		entityRef: node.ref
			? {
					type: node.ref.type,
					id: node.ref.id,
					workspaceId: node.ref.workspaceId,
				}
			: undefined,
	};
}

function projectEdge(edge: CanvasEdge): CanvasRendererEdgeProjection {
	return {
		id: edge.id,
		sourceNodeId: edge.from.nodeId,
		targetNodeId: edge.to.nodeId,
		sourceSide: edge.from.side,
		targetSide: edge.to.side,
		label: edge.label,
		directed: edge.directed,
		color: edge.color?.value ?? edge.color?.key,
	};
}

export function projectCanvasForRenderer(
	document: CanvasDocument,
): CanvasRendererProjection {
	return {
		id: document.id,
		title: document.title,
		nodes: document.nodes.map(projectNode),
		edges: document.edges.map(projectEdge),
		groups: document.groups.map((group) => ({
			id: group.id,
			title: group.title,
			nodeIds: group.nodeIds,
			position: group.position,
			size: group.size,
		})),
	};
}
