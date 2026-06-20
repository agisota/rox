import type {
	CanvasCapability,
	CanvasCapabilityAction,
	CanvasCapabilitySubject,
	CanvasDocument,
	CanvasEdge,
	CanvasEdgeEndpoint,
	CanvasGroup,
	CanvasJsonObject,
	CanvasJsonValue,
	CanvasNode,
	CanvasNodeRef,
	CanvasPoint,
	CanvasSize,
} from "./types";

const CAPABILITY_SUBJECTS = new Set<CanvasCapabilitySubject>([
	"document",
	"node",
	"edge",
	"group",
	"selection",
]);

const CAPABILITY_ACTIONS = new Set<CanvasCapabilityAction>([
	"read",
	"create",
	"update",
	"delete",
	"connect",
	"group",
	"ungroup",
	"reorder",
]);

export function isCanvasJsonValue(value: unknown): value is CanvasJsonValue {
	if (value === null) return true;

	switch (typeof value) {
		case "string":
		case "boolean":
			return true;
		case "number":
			return Number.isFinite(value);
		case "object":
			if (Array.isArray(value)) {
				return value.every(isCanvasJsonValue);
			}
			return isCanvasJsonObject(value);
		default:
			return false;
	}
}

export function isCanvasJsonObject(value: unknown): value is CanvasJsonObject {
	if (!isRecord(value)) return false;
	return Object.values(value).every(isCanvasJsonValue);
}

export function isCanvasNodeRef(value: unknown): value is CanvasNodeRef {
	return isRecord(value) && value.kind === "node" && isNonEmptyString(value.id);
}

export function isCanvasNode(value: unknown): value is CanvasNode {
	return (
		isRecord(value) &&
		isNonEmptyString(value.id) &&
		isNonEmptyString(value.type) &&
		isCanvasPoint(value.position) &&
		isOptionalCanvasSize(value.size) &&
		isOptionalString(value.groupId) &&
		isOptionalString(value.title) &&
		isOptionalCanvasJsonObject(value.data) &&
		isOptionalNodeRefs(value.refs)
	);
}

export function isCanvasEdge(value: unknown): value is CanvasEdge {
	return (
		isRecord(value) &&
		isNonEmptyString(value.id) &&
		isNonEmptyString(value.type) &&
		isCanvasEdgeEndpoint(value.source) &&
		isCanvasEdgeEndpoint(value.target) &&
		isOptionalString(value.title) &&
		isOptionalCanvasJsonObject(value.data)
	);
}

export function isCanvasGroup(value: unknown): value is CanvasGroup {
	return (
		isRecord(value) &&
		isNonEmptyString(value.id) &&
		isNonEmptyString(value.type) &&
		isOptionalString(value.title) &&
		isStringArray(value.nodeIds) &&
		isOptionalString(value.parentGroupId) &&
		isOptionalBoolean(value.collapsed) &&
		isOptionalCanvasJsonObject(value.data)
	);
}

export function isCanvasCapability(value: unknown): value is CanvasCapability {
	return (
		isRecord(value) &&
		typeof value.subject === "string" &&
		CAPABILITY_SUBJECTS.has(value.subject as CanvasCapabilitySubject) &&
		typeof value.action === "string" &&
		CAPABILITY_ACTIONS.has(value.action as CanvasCapabilityAction) &&
		typeof value.enabled === "boolean" &&
		isOptionalString(value.reason) &&
		isOptionalCanvasJsonObject(value.data)
	);
}

export function isCanvasDocument(value: unknown): value is CanvasDocument {
	if (
		!isRecord(value) ||
		value.schemaVersion !== 1 ||
		!isNonEmptyString(value.id) ||
		!isOptionalString(value.title) ||
		!Array.isArray(value.nodes) ||
		!value.nodes.every(isCanvasNode) ||
		!Array.isArray(value.edges) ||
		!value.edges.every(isCanvasEdge) ||
		!Array.isArray(value.groups) ||
		!value.groups.every(isCanvasGroup) ||
		!isOptionalCanvasCapabilities(value.capabilities) ||
		!isOptionalCanvasJsonObject(value.data)
	) {
		return false;
	}

	return (
		hasUniqueIds(value.nodes) &&
		hasUniqueIds(value.edges) &&
		hasUniqueIds(value.groups) &&
		hasValidReferences(value as CanvasDocument)
	);
}

export function assertCanvasDocument(
	value: unknown,
	message = "Invalid canvas document",
): asserts value is CanvasDocument {
	if (!isCanvasDocument(value)) {
		throw new TypeError(message);
	}
}

export function assertCanvasNode(
	value: unknown,
	message = "Invalid canvas node",
): asserts value is CanvasNode {
	if (!isCanvasNode(value)) {
		throw new TypeError(message);
	}
}

export function assertCanvasEdge(
	value: unknown,
	message = "Invalid canvas edge",
): asserts value is CanvasEdge {
	if (!isCanvasEdge(value)) {
		throw new TypeError(message);
	}
}

export function assertCanvasGroup(
	value: unknown,
	message = "Invalid canvas group",
): asserts value is CanvasGroup {
	if (!isCanvasGroup(value)) {
		throw new TypeError(message);
	}
}

function isCanvasPoint(value: unknown): value is CanvasPoint {
	return (
		isRecord(value) &&
		typeof value.x === "number" &&
		Number.isFinite(value.x) &&
		typeof value.y === "number" &&
		Number.isFinite(value.y)
	);
}

function isCanvasSize(value: unknown): value is CanvasSize {
	return (
		isRecord(value) &&
		typeof value.width === "number" &&
		Number.isFinite(value.width) &&
		value.width >= 0 &&
		typeof value.height === "number" &&
		Number.isFinite(value.height) &&
		value.height >= 0
	);
}

function isCanvasEdgeEndpoint(value: unknown): value is CanvasEdgeEndpoint {
	return (
		isRecord(value) &&
		isCanvasNodeRef(value.node) &&
		isOptionalString(value.portId)
	);
}

function isOptionalCanvasSize(value: unknown): value is CanvasSize | undefined {
	return value === undefined || isCanvasSize(value);
}

function isOptionalCanvasJsonObject(
	value: unknown,
): value is CanvasJsonObject | undefined {
	return value === undefined || isCanvasJsonObject(value);
}

function isOptionalNodeRefs(
	value: unknown,
): value is CanvasNodeRef[] | undefined {
	return (
		value === undefined ||
		(Array.isArray(value) && value.every(isCanvasNodeRef))
	);
}

function isOptionalCanvasCapabilities(
	value: unknown,
): value is CanvasCapability[] | undefined {
	return (
		value === undefined ||
		(Array.isArray(value) && value.every(isCanvasCapability))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
	return value === undefined || typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasUniqueIds(items: Array<{ id: string }>): boolean {
	return new Set(items.map((item) => item.id)).size === items.length;
}

function hasValidReferences(document: CanvasDocument): boolean {
	const nodeIds = new Set(document.nodes.map((node) => node.id));
	const groupIds = new Set(document.groups.map((group) => group.id));

	return (
		document.nodes.every(
			(node) =>
				(node.groupId === undefined || groupIds.has(node.groupId)) &&
				(node.refs === undefined ||
					node.refs.every((ref) => nodeIds.has(ref.id))),
		) &&
		document.edges.every(
			(edge) =>
				nodeIds.has(edge.source.node.id) && nodeIds.has(edge.target.node.id),
		) &&
		document.groups.every(
			(group) =>
				group.nodeIds.every((nodeId) => nodeIds.has(nodeId)) &&
				(group.parentGroupId === undefined ||
					groupIds.has(group.parentGroupId)),
		)
	);
}
