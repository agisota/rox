import { z } from "zod";
import {
	type CanvasDocument,
	type CanvasEdge,
	type CanvasGroup,
	type CanvasNode,
	canvasColorSchema,
	canvasDocumentSchema,
	canvasEdgeEndpointSchema,
	canvasEdgeSchema,
	canvasGroupSchema,
	canvasNodeRefSchema,
	canvasNodeSchema,
	canvasNodeTypeSchema,
	canvasPointSchema,
	canvasSizeSchema,
} from "./schema";

export const canvasMutationActorSchema = z.object({
	id: z.string().min(1),
	type: z.enum(["user", "agent", "system"]),
	label: z.string().optional(),
});

const canvasNodeUpdatePatchSchema = z
	.object({
		type: canvasNodeTypeSchema.optional(),
		position: canvasPointSchema.optional(),
		size: canvasSizeSchema.optional(),
		title: z.string().optional(),
		text: z.string().optional(),
		ref: canvasNodeRefSchema.optional(),
		color: canvasColorSchema.optional(),
		tags: z.array(z.string().min(1)).optional(),
		groupId: z.string().min(1).optional(),
		locked: z.boolean().optional(),
		collapsed: z.boolean().optional(),
		createdAt: z.string().min(1).optional(),
		updatedAt: z.string().min(1).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

const canvasEdgeUpdatePatchSchema = z
	.object({
		from: canvasEdgeEndpointSchema.optional(),
		to: canvasEdgeEndpointSchema.optional(),
		label: z.string().optional(),
		color: canvasColorSchema.optional(),
		directed: z.boolean().optional(),
		createdAt: z.string().min(1).optional(),
		updatedAt: z.string().min(1).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

const canvasGroupUpdatePatchSchema = z
	.object({
		title: z.string().optional(),
		position: canvasPointSchema.optional(),
		size: canvasSizeSchema.optional(),
		color: canvasColorSchema.optional(),
		collapsed: z.boolean().optional(),
		nodeIds: z.array(z.string().min(1)).optional(),
		createdAt: z.string().min(1).optional(),
		updatedAt: z.string().min(1).optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const canvasMutationSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("node.add"),
		node: canvasNodeSchema,
	}),
	z.object({
		type: z.literal("node.update"),
		nodeId: z.string().min(1),
		patch: canvasNodeUpdatePatchSchema,
	}),
	z.object({
		type: z.literal("node.delete"),
		nodeId: z.string().min(1),
	}),
	z.object({
		type: z.literal("edge.add"),
		edge: canvasEdgeSchema,
	}),
	z.object({
		type: z.literal("edge.update"),
		edgeId: z.string().min(1),
		patch: canvasEdgeUpdatePatchSchema,
	}),
	z.object({
		type: z.literal("edge.delete"),
		edgeId: z.string().min(1),
	}),
	z.object({
		type: z.literal("group.add"),
		group: canvasGroupSchema,
	}),
	z.object({
		type: z.literal("group.update"),
		groupId: z.string().min(1),
		patch: canvasGroupUpdatePatchSchema,
	}),
	z.object({
		type: z.literal("group.delete"),
		groupId: z.string().min(1),
	}),
	z.object({
		type: z.literal("document.update"),
		patch: z
			.object({
				title: z.string().min(1),
				description: z.string(),
				tags: z.array(z.string().min(1)),
				metadata: z.record(z.string(), z.unknown()),
			})
			.partial(),
	}),
]);

export const canvasMutationBatchSchema = z.object({
	id: z.string().min(1),
	canvasId: z.string().min(1),
	baseVersion: z.number().int().nonnegative(),
	createdAt: z.string().min(1),
	actor: canvasMutationActorSchema,
	mutations: z.array(canvasMutationSchema).min(1),
	history: z
		.object({
			kind: z.enum(["undo", "redo"]),
			targetBatchId: z.string().min(1),
		})
		.optional(),
});

export type CanvasMutationActor = z.infer<typeof canvasMutationActorSchema>;
export type CanvasMutation = z.infer<typeof canvasMutationSchema>;
export type CanvasMutationBatch = z.infer<typeof canvasMutationBatchSchema>;

function replaceById<T extends { id: string }>(
	items: T[],
	id: string,
	update: (item: T) => T,
): T[] {
	let found = false;
	const next = items.map((item) => {
		if (item.id !== id) return item;
		found = true;
		return update(item);
	});
	if (!found) throw new Error(`Canvas item not found: ${id}`);
	return next;
}

export function applyCanvasMutation(
	document: CanvasDocument,
	mutation: CanvasMutation,
): CanvasDocument {
	switch (mutation.type) {
		case "node.add":
			return canvasDocumentSchema.parse({
				...document,
				nodes: [...document.nodes, mutation.node],
			});
		case "node.update":
			return canvasDocumentSchema.parse({
				...document,
				nodes: replaceById<CanvasNode>(
					document.nodes,
					mutation.nodeId,
					(node) => ({
						...node,
						...mutation.patch,
						id: node.id,
					}),
				),
			});
		case "node.delete":
			return canvasDocumentSchema.parse({
				...document,
				nodes: document.nodes.filter((node) => node.id !== mutation.nodeId),
				edges: document.edges.filter(
					(edge) =>
						edge.from.nodeId !== mutation.nodeId &&
						edge.to.nodeId !== mutation.nodeId,
				),
				groups: document.groups.map((group) => ({
					...group,
					nodeIds: group.nodeIds.filter((nodeId) => nodeId !== mutation.nodeId),
				})),
			});
		case "edge.add":
			return canvasDocumentSchema.parse({
				...document,
				edges: [...document.edges, mutation.edge],
			});
		case "edge.update":
			return canvasDocumentSchema.parse({
				...document,
				edges: replaceById<CanvasEdge>(
					document.edges,
					mutation.edgeId,
					(edge) => ({
						...edge,
						...mutation.patch,
						id: edge.id,
					}),
				),
			});
		case "edge.delete":
			return canvasDocumentSchema.parse({
				...document,
				edges: document.edges.filter((edge) => edge.id !== mutation.edgeId),
			});
		case "group.add":
			return canvasDocumentSchema.parse({
				...document,
				groups: [...document.groups, mutation.group],
				nodes: document.nodes.map((node) =>
					mutation.group.nodeIds.includes(node.id)
						? { ...node, groupId: mutation.group.id }
						: node,
				),
			});
		case "group.update":
			return canvasDocumentSchema.parse({
				...document,
				groups: replaceById<CanvasGroup>(
					document.groups,
					mutation.groupId,
					(group) => ({
						...group,
						...mutation.patch,
						id: group.id,
					}),
				),
			});
		case "group.delete":
			return canvasDocumentSchema.parse({
				...document,
				groups: document.groups.filter(
					(group) => group.id !== mutation.groupId,
				),
				nodes: document.nodes.map((node) =>
					node.groupId === mutation.groupId
						? { ...node, groupId: undefined }
						: node,
				),
			});
		case "document.update":
			return canvasDocumentSchema.parse({
				...document,
				...mutation.patch,
			});
		default:
			mutation satisfies never;
			return document;
	}
}

export function applyCanvasMutationBatch(
	document: CanvasDocument,
	batch: CanvasMutationBatch,
): CanvasDocument {
	if (document.id !== batch.canvasId) {
		throw new Error(
			`Canvas mutation batch ${batch.id} targets ${batch.canvasId}, not ${document.id}`,
		);
	}
	return batch.mutations.reduce(applyCanvasMutation, document);
}

type NodeUpdateMutation = Extract<CanvasMutation, { type: "node.update" }>;
type EdgeUpdateMutation = Extract<CanvasMutation, { type: "edge.update" }>;
type GroupUpdateMutation = Extract<CanvasMutation, { type: "group.update" }>;
type DocumentUpdateMutation = Extract<
	CanvasMutation,
	{ type: "document.update" }
>;

interface RebaseCanvasMutationBatchInput {
	batch: CanvasMutationBatch;
	baseVersion: number;
	actorId?: string;
	createId?: () => string;
	now?: () => string;
}

interface CreateInverseCanvasMutationBatchInput {
	document: CanvasDocument;
	batch: CanvasMutationBatch;
	baseVersion: number;
	actorId: string;
	createId?: () => string;
	now?: () => string;
}

function createBatchId(createId?: () => string) {
	return createId?.() ?? globalThis.crypto.randomUUID();
}

function createTimestamp(now?: () => string) {
	return now?.() ?? new Date().toISOString();
}

function findCanvasNode(document: CanvasDocument, nodeId: string): CanvasNode {
	const node = document.nodes.find((candidate) => candidate.id === nodeId);
	if (!node) {
		throw new Error(
			`Cannot invert canvas mutation: node ${nodeId} was not found.`,
		);
	}
	return node;
}

function findCanvasEdge(document: CanvasDocument, edgeId: string): CanvasEdge {
	const edge = document.edges.find((candidate) => candidate.id === edgeId);
	if (!edge) {
		throw new Error(
			`Cannot invert canvas mutation: edge ${edgeId} was not found.`,
		);
	}
	return edge;
}

function findCanvasGroup(
	document: CanvasDocument,
	groupId: string,
): CanvasGroup {
	const group = document.groups.find((candidate) => candidate.id === groupId);
	if (!group) {
		throw new Error(
			`Cannot invert canvas mutation: group ${groupId} was not found.`,
		);
	}
	return group;
}

function createPreviousPatch<TSource extends object>(
	source: TSource,
	patch: Record<string, unknown>,
) {
	const sourceRecord = source as Record<string, unknown>;
	return Object.fromEntries(
		Object.keys(patch).map((key) => [key, sourceRecord[key]]),
	);
}

function getIncidentEdges(document: CanvasDocument, nodeId: string) {
	return document.edges.filter(
		(edge) => edge.from.nodeId === nodeId || edge.to.nodeId === nodeId,
	);
}

function invertCanvasMutation(
	document: CanvasDocument,
	mutation: CanvasMutation,
	explicitlyDeletedEdgeIds: Set<string>,
): CanvasMutation[] {
	switch (mutation.type) {
		case "node.add":
			return [{ type: "node.delete", nodeId: mutation.node.id }];
		case "node.update": {
			const node = findCanvasNode(document, mutation.nodeId);
			return [
				{
					type: "node.update",
					nodeId: mutation.nodeId,
					patch: createPreviousPatch(
						node,
						mutation.patch as Record<string, unknown>,
					) as NodeUpdateMutation["patch"],
				},
			];
		}
		case "node.delete": {
			const node = findCanvasNode(document, mutation.nodeId);
			const incidentEdgeMutations = getIncidentEdges(document, mutation.nodeId)
				.filter((edge) => !explicitlyDeletedEdgeIds.has(edge.id))
				.map((edge): CanvasMutation => ({ type: "edge.add", edge }));
			return [{ type: "node.add", node }, ...incidentEdgeMutations];
		}
		case "edge.add":
			return [{ type: "edge.delete", edgeId: mutation.edge.id }];
		case "edge.update": {
			const edge = findCanvasEdge(document, mutation.edgeId);
			return [
				{
					type: "edge.update",
					edgeId: mutation.edgeId,
					patch: createPreviousPatch(
						edge,
						mutation.patch as Record<string, unknown>,
					) as EdgeUpdateMutation["patch"],
				},
			];
		}
		case "edge.delete":
			return [
				{ type: "edge.add", edge: findCanvasEdge(document, mutation.edgeId) },
			];
		case "group.add":
			return [{ type: "group.delete", groupId: mutation.group.id }];
		case "group.update": {
			const group = findCanvasGroup(document, mutation.groupId);
			return [
				{
					type: "group.update",
					groupId: mutation.groupId,
					patch: createPreviousPatch(
						group,
						mutation.patch as Record<string, unknown>,
					) as GroupUpdateMutation["patch"],
				},
			];
		}
		case "group.delete":
			return [
				{
					type: "group.add",
					group: findCanvasGroup(document, mutation.groupId),
				},
			];
		case "document.update":
			return [
				{
					type: "document.update",
					patch: createPreviousPatch(
						document,
						mutation.patch as Record<string, unknown>,
					) as DocumentUpdateMutation["patch"],
				},
			];
		default:
			mutation satisfies never;
			return [];
	}
}

export function rebaseCanvasMutationBatch({
	batch,
	baseVersion,
	actorId,
	createId,
	now,
}: RebaseCanvasMutationBatchInput): CanvasMutationBatch {
	return {
		...batch,
		id: createBatchId(createId),
		baseVersion,
		createdAt: createTimestamp(now),
		actor: actorId
			? {
					...batch.actor,
					id: actorId,
				}
			: batch.actor,
	};
}

export function createInverseCanvasMutationBatch({
	document,
	batch,
	baseVersion,
	actorId,
	createId,
	now,
}: CreateInverseCanvasMutationBatchInput): CanvasMutationBatch {
	const explicitlyDeletedEdgeIds = new Set(
		batch.mutations
			.filter((mutation) => mutation.type === "edge.delete")
			.map((mutation) => mutation.edgeId),
	);

	return {
		id: createBatchId(createId),
		canvasId: batch.canvasId,
		baseVersion,
		createdAt: createTimestamp(now),
		actor: {
			id: actorId,
			type: "user",
			label: "Rox Canvas History",
		},
		mutations: [...batch.mutations]
			.reverse()
			.flatMap((mutation) =>
				invertCanvasMutation(document, mutation, explicitlyDeletedEdgeIds),
			),
	};
}
