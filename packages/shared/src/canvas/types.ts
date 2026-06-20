export type CanvasId = string;

export type CanvasJsonPrimitive = string | number | boolean | null;

export type CanvasJsonValue =
	| CanvasJsonPrimitive
	| CanvasJsonValue[]
	| { [key: string]: CanvasJsonValue };

export type CanvasJsonObject = { [key: string]: CanvasJsonValue };

export type CanvasPoint = Readonly<{
	x: number;
	y: number;
}>;

export type CanvasSize = Readonly<{
	width: number;
	height: number;
}>;

export type CanvasNodeRef = Readonly<{
	kind: "node";
	id: CanvasId;
}>;

export type CanvasEdgeEndpoint = Readonly<{
	node: CanvasNodeRef;
	portId?: CanvasId;
}>;

export type CanvasNode = Readonly<{
	id: CanvasId;
	type: string;
	position: CanvasPoint;
	size?: CanvasSize;
	groupId?: CanvasId;
	title?: string;
	data?: CanvasJsonObject;
	refs?: CanvasNodeRef[];
}>;

export type CanvasEdge = Readonly<{
	id: CanvasId;
	type: string;
	source: CanvasEdgeEndpoint;
	target: CanvasEdgeEndpoint;
	title?: string;
	data?: CanvasJsonObject;
}>;

export type CanvasGroup = Readonly<{
	id: CanvasId;
	type: string;
	title?: string;
	nodeIds: CanvasId[];
	parentGroupId?: CanvasId;
	collapsed?: boolean;
	data?: CanvasJsonObject;
}>;

export type CanvasCapabilitySubject =
	| "document"
	| "node"
	| "edge"
	| "group"
	| "selection";

export type CanvasCapabilityAction =
	| "read"
	| "create"
	| "update"
	| "delete"
	| "connect"
	| "group"
	| "ungroup"
	| "reorder";

export type CanvasCapability = Readonly<{
	subject: CanvasCapabilitySubject;
	action: CanvasCapabilityAction;
	enabled: boolean;
	reason?: string;
	data?: CanvasJsonObject;
}>;

export type CanvasDocument = Readonly<{
	schemaVersion: 1;
	id: CanvasId;
	title?: string;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	groups: CanvasGroup[];
	capabilities?: CanvasCapability[];
	data?: CanvasJsonObject;
}>;

export type CanvasMutation =
	| Readonly<{ type: "node.add"; node: CanvasNode }>
	| Readonly<{ type: "node.update"; id: CanvasId; patch: PartialCanvasNode }>
	| Readonly<{ type: "node.remove"; id: CanvasId }>
	| Readonly<{ type: "edge.add"; edge: CanvasEdge }>
	| Readonly<{ type: "edge.update"; id: CanvasId; patch: PartialCanvasEdge }>
	| Readonly<{ type: "edge.remove"; id: CanvasId }>
	| Readonly<{ type: "group.add"; group: CanvasGroup }>
	| Readonly<{ type: "group.update"; id: CanvasId; patch: PartialCanvasGroup }>
	| Readonly<{ type: "group.remove"; id: CanvasId }>
	| Readonly<{ type: "capability.set"; capability: CanvasCapability }>
	| Readonly<{ type: "document.update"; patch: PartialCanvasDocument }>;

export type PartialCanvasNode = Partial<Omit<CanvasNode, "id">>;
export type PartialCanvasEdge = Partial<Omit<CanvasEdge, "id">>;
export type PartialCanvasGroup = Partial<Omit<CanvasGroup, "id">>;
export type PartialCanvasDocument = Partial<
	Omit<CanvasDocument, "schemaVersion" | "id" | "nodes" | "edges" | "groups">
>;
