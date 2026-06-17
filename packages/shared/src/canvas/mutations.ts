import type {
	CanvasCapability,
	CanvasDocument,
	CanvasEdge,
	CanvasGroup,
	CanvasId,
	CanvasMutation,
	CanvasNode,
	CanvasNodeRef,
} from "./types";
import { assertCanvasDocument } from "./validators";

export function applyCanvasMutation(
	document: CanvasDocument,
	mutation: CanvasMutation,
): CanvasDocument {
	const nextDocument = applyUncheckedCanvasMutation(document, mutation);
	assertCanvasDocument(nextDocument);
	return nextDocument;
}

export function applyCanvasMutations(
	document: CanvasDocument,
	mutations: CanvasMutation[],
): CanvasDocument {
	return mutations.reduce(applyCanvasMutation, document);
}

function applyUncheckedCanvasMutation(
	document: CanvasDocument,
	mutation: CanvasMutation,
): CanvasDocument {
	switch (mutation.type) {
		case "node.add":
			ensureMissing(document.nodes, mutation.node.id, "node");
			return {
				...document,
				nodes: [...document.nodes, mutation.node],
			};
		case "node.update":
			return {
				...document,
				nodes: updateById(document.nodes, mutation.id, mutation.patch, "node"),
			};
		case "node.remove":
			ensurePresent(document.nodes, mutation.id, "node");
			return {
				...document,
				nodes: document.nodes
					.filter((node) => node.id !== mutation.id)
					.map((node) => withoutNodeRef(node, mutation.id)),
				edges: document.edges.filter(
					(edge) =>
						edge.source.node.id !== mutation.id &&
						edge.target.node.id !== mutation.id,
				),
				groups: document.groups.map((group) => ({
					...group,
					nodeIds: group.nodeIds.filter((nodeId) => nodeId !== mutation.id),
				})),
			};
		case "edge.add":
			ensureMissing(document.edges, mutation.edge.id, "edge");
			return {
				...document,
				edges: [...document.edges, mutation.edge],
			};
		case "edge.update":
			return {
				...document,
				edges: updateById(document.edges, mutation.id, mutation.patch, "edge"),
			};
		case "edge.remove":
			ensurePresent(document.edges, mutation.id, "edge");
			return {
				...document,
				edges: document.edges.filter((edge) => edge.id !== mutation.id),
			};
		case "group.add":
			ensureMissing(document.groups, mutation.group.id, "group");
			return {
				...document,
				groups: [...document.groups, mutation.group],
			};
		case "group.update":
			return {
				...document,
				groups: updateById(
					document.groups,
					mutation.id,
					mutation.patch,
					"group",
				),
			};
		case "group.remove":
			ensurePresent(document.groups, mutation.id, "group");
			return {
				...document,
				nodes: document.nodes.map((node) =>
					node.groupId === mutation.id ? withoutGroup(node) : node,
				),
				groups: document.groups
					.filter((group) => group.id !== mutation.id)
					.map((group) =>
						group.parentGroupId === mutation.id
							? withoutParentGroup(group)
							: group,
					),
			};
		case "capability.set":
			return {
				...document,
				capabilities: upsertCapability(
					document.capabilities ?? [],
					mutation.capability,
				),
			};
		case "document.update":
			return {
				...document,
				...mutation.patch,
			};
	}
}

function updateById<TItem extends { id: CanvasId }>(
	items: TItem[],
	id: CanvasId,
	patch: Partial<Omit<TItem, "id">>,
	label: string,
): TItem[] {
	ensurePresent(items, id, label);
	return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function ensurePresent(
	items: Array<{ id: CanvasId }>,
	id: CanvasId,
	label: string,
): void {
	if (!items.some((item) => item.id === id)) {
		throw new Error(`Cannot find canvas ${label} "${id}"`);
	}
}

function ensureMissing(
	items: Array<{ id: CanvasId }>,
	id: CanvasId,
	label: string,
): void {
	if (items.some((item) => item.id === id)) {
		throw new Error(`Canvas ${label} "${id}" already exists`);
	}
}

function withoutGroup(node: CanvasNode): CanvasNode {
	const { groupId: _groupId, ...nextNode } = node;
	return nextNode;
}

function withoutNodeRef(node: CanvasNode, nodeId: CanvasId): CanvasNode {
	if (!node.refs?.some((ref) => ref.id === nodeId)) return node;

	const nextRefs = node.refs.filter((ref) => ref.id !== nodeId);
	if (nextRefs.length === 0) {
		const { refs: _refs, ...nextNode } = node;
		return nextNode;
	}

	return {
		...node,
		refs: nextRefs,
	};
}

function withoutParentGroup(group: CanvasGroup): CanvasGroup {
	const { parentGroupId: _parentGroupId, ...nextGroup } = group;
	return nextGroup;
}

function upsertCapability(
	capabilities: CanvasCapability[],
	capability: CanvasCapability,
): CanvasCapability[] {
	const index = capabilities.findIndex(
		(existing) =>
			existing.subject === capability.subject &&
			existing.action === capability.action,
	);

	if (index === -1) {
		return [...capabilities, capability];
	}

	return capabilities.map((existing, existingIndex) =>
		existingIndex === index ? capability : existing,
	);
}

export function createCanvasNodeRef(id: CanvasId): CanvasNodeRef {
	return { kind: "node", id };
}

export function createCanvasEdge({
	id,
	type,
	sourceNodeId,
	targetNodeId,
}: {
	id: CanvasId;
	type: string;
	sourceNodeId: CanvasId;
	targetNodeId: CanvasId;
}): CanvasEdge {
	return {
		id,
		type,
		source: { node: createCanvasNodeRef(sourceNodeId) },
		target: { node: createCanvasNodeRef(targetNodeId) },
	};
}

export function createCanvasGroup({
	id,
	type,
	nodeIds,
	title,
}: {
	id: CanvasId;
	type: string;
	nodeIds: CanvasId[];
	title?: string;
}): CanvasGroup {
	return {
		id,
		type,
		nodeIds,
		...(title === undefined ? {} : { title }),
	};
}
