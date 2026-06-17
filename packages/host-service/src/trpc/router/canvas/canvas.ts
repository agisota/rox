import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import {
	builtInCanvasCapabilities,
	type CanvasColor,
	type CanvasDocument,
	type CanvasGroup,
	type CanvasMutation,
	type CanvasMutationBatch,
	type CanvasNode,
	type CanvasNodeRef,
	canvasDocumentSchema,
	canvasMutationBatchSchema,
	createInverseCanvasMutationBatch,
	exportJsonCanvas,
	importJsonCanvas,
} from "@rox/shared/canvas";
import { TRPCError } from "@trpc/server";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import type { HostDb } from "../../../db";
import { canvasDocuments, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	applyAndPersistCanvasMutationBatch,
	type CanvasIndexSummary,
	type CanvasStorageWorkspace,
	createCanvasDocument,
	createCanvasSnapshot,
	deleteCanvasDocument,
	initializeCanvasDocument,
	listCanvasDocumentIds,
	listCanvasSnapshots,
	readCanvasDocument,
	readCanvasDocumentAtRevision,
	readCanvasPatchBatches,
	replayCanvasDocument,
	restoreCanvasSnapshot,
	summarizeCanvasDocument,
} from "./storage";

const canvasIdInput = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const workspaceCanvasInput = z.object({
	workspaceId: z.string().min(1),
	canvasId: canvasIdInput,
});

type CanvasWatchEventType =
	| "create"
	| "update"
	| "patch"
	| "delete"
	| "import"
	| "restore"
	| "undo"
	| "redo";

type CanvasWatchEvent = {
	type: CanvasWatchEventType;
	workspaceId: string;
	canvasId: string;
	revision: number | null;
	occurredAt: string;
	index: CanvasIndexSummary | null;
};

const CANVAS_WATCH_EVENT = "canvas:watch";
const canvasWatchEmitter = new EventEmitter();

function emitCanvasWatchEvent(args: {
	type: CanvasWatchEventType;
	workspaceId: string;
	canvasId: string;
	revision: number | null;
	index: CanvasIndexSummary | null;
}) {
	canvasWatchEmitter.emit(CANVAS_WATCH_EVENT, {
		...args,
		occurredAt: new Date().toISOString(),
	} satisfies CanvasWatchEvent);
}

function requireWorkspace(
	ctx: { db: HostDb },
	workspaceId: string,
): CanvasStorageWorkspace {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
	if (!existsSync(workspace.worktreePath)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace worktree does not exist",
		});
	}
	return workspace;
}

function ensureCanvasBelongsToWorkspace(
	document: CanvasDocument,
	workspaceId: string,
): CanvasDocument {
	if (document.workspaceId !== workspaceId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Canvas does not belong to requested workspace",
		});
	}
	return document;
}

function readWorkspaceCanvasDocument(args: {
	workspace: CanvasStorageWorkspace;
	workspaceId: string;
	canvasId: string;
}): CanvasDocument {
	return ensureCanvasBelongsToWorkspace(
		readCanvasDocument(args.workspace.worktreePath, args.canvasId),
		args.workspaceId,
	);
}

function validateCanvasNodeRefAccess(
	ref: Pick<CanvasNodeRef, "workspaceId" | "path" | "url">,
	workspaceId: string,
) {
	if (ref.workspaceId && ref.workspaceId !== workspaceId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Canvas ref does not belong to requested workspace",
		});
	}
	if (
		ref.path &&
		(ref.path.startsWith("/") || ref.path.split(/[\\/]+/).includes(".."))
	) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Canvas ref path is outside the workspace",
		});
	}
	if (ref.url) {
		try {
			const url = new URL(ref.url);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Canvas ref URL protocol is not supported",
				});
			}
		} catch (error) {
			if (error instanceof TRPCError) throw error;
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Canvas ref URL is invalid",
			});
		}
	}
}

function validateCanvasMutationBatchSecurityScope(
	batch: CanvasMutationBatch,
	workspaceId: string,
) {
	for (const mutation of batch.mutations) {
		if (mutation.type === "node.add" && mutation.node.ref) {
			validateCanvasNodeRefAccess(mutation.node.ref, workspaceId);
		}
		if (mutation.type === "node.update" && mutation.patch.ref) {
			validateCanvasNodeRefAccess(mutation.patch.ref, workspaceId);
		}
	}
}

function upsertCanvasIndex(ctx: { db: HostDb }, summary: CanvasIndexSummary) {
	ctx.db
		.insert(canvasDocuments)
		.values({
			id: summary.id,
			workspaceId: summary.workspaceId,
			projectId: summary.projectId,
			title: summary.title,
			revision: summary.revision,
			path: summary.path,
			nodeCount: summary.nodeCount,
			edgeCount: summary.edgeCount,
			groupCount: summary.groupCount,
			nodeTypesJson: JSON.stringify(summary.nodeTypes),
			refsJson: JSON.stringify(summary.refs),
			createdAt: summary.createdAt,
			updatedAt: summary.updatedAt,
		})
		.onConflictDoUpdate({
			target: canvasDocuments.id,
			set: {
				workspaceId: summary.workspaceId,
				projectId: summary.projectId,
				title: summary.title,
				revision: summary.revision,
				path: summary.path,
				nodeCount: summary.nodeCount,
				edgeCount: summary.edgeCount,
				groupCount: summary.groupCount,
				nodeTypesJson: JSON.stringify(summary.nodeTypes),
				refsJson: JSON.stringify(summary.refs),
				updatedAt: summary.updatedAt,
			},
		})
		.run();
}

function parseIndexRow(row: typeof canvasDocuments.$inferSelect) {
	return {
		...row,
		nodeTypes: JSON.parse(row.nodeTypesJson) as Record<string, number>,
		refs: JSON.parse(row.refsJson) as unknown[],
	};
}

function reindexWorkspaceCanvases(
	ctx: { db: HostDb },
	workspace: CanvasStorageWorkspace,
): ReturnType<typeof parseIndexRow>[] {
	for (const canvasId of listCanvasDocumentIds(workspace.worktreePath)) {
		const document = ensureCanvasBelongsToWorkspace(
			readCanvasDocument(workspace.worktreePath, canvasId),
			workspace.id,
		);
		const revision = replaySafeRevision(workspace.worktreePath, canvasId);
		upsertCanvasIndex(
			ctx,
			summarizeCanvasDocument(workspace.worktreePath, document, revision),
		);
	}
	return ctx.db.query.canvasDocuments
		.findMany({ where: eq(canvasDocuments.workspaceId, workspace.id) })
		.sync()
		.map(parseIndexRow);
}

function replaySafeRevision(worktreePath: string, canvasId: string): number {
	try {
		replayCanvasDocument(worktreePath, canvasId);
		return readCanvasPatchBatches(worktreePath, canvasId).length;
	} catch {
		return 0;
	}
}

function isUndoBatchActor(actorId: string): boolean {
	return actorId === "host-service-undo" || actorId === "renderer-undo";
}

type IndexedCanvasPatch = {
	batch: CanvasMutationBatch;
	index: number;
};

function resolvePersistedHistoryState(
	patches: CanvasMutationBatch[],
): Map<string, "applied" | "undone"> {
	const state = new Map<string, "applied" | "undone">();
	for (const batch of patches) {
		if (!batch.history) {
			state.set(batch.id, "applied");
			continue;
		}
		state.set(
			batch.history.targetBatchId,
			batch.history.kind === "undo" ? "undone" : "applied",
		);
	}
	return state;
}

function findPersistedUndoTarget(
	patches: CanvasMutationBatch[],
): IndexedCanvasPatch | null {
	const historyState = resolvePersistedHistoryState(patches);
	for (let index = patches.length - 1; index >= 0; index -= 1) {
		const batch = patches[index];
		if (!batch || batch.history) continue;
		if (historyState.get(batch.id) === "applied") return { batch, index };
	}
	return null;
}

function findLastNonHistoryPatchIndex(patches: CanvasMutationBatch[]): number {
	let lastIndex = -1;
	for (const [index, batch] of patches.entries()) {
		if (!batch.history) lastIndex = index;
	}
	return lastIndex;
}

function findPersistedRedoTarget(
	patches: CanvasMutationBatch[],
): (IndexedCanvasPatch & { targetBatchId: string }) | null {
	const historyState = resolvePersistedHistoryState(patches);
	const lastNonHistoryPatchIndex = findLastNonHistoryPatchIndex(patches);
	for (
		let index = patches.length - 1;
		index > lastNonHistoryPatchIndex;
		index -= 1
	) {
		const batch = patches[index];
		const targetBatchId = batch?.history?.targetBatchId;
		if (!batch || batch.history?.kind !== "undo" || !targetBatchId) continue;
		if (historyState.get(targetBatchId) === "undone") {
			return { batch, index, targetBatchId };
		}
	}
	return null;
}

function findCanvasOrphanNodes(document: CanvasDocument) {
	const linked = new Set<string>();
	for (const edge of document.edges) {
		linked.add(edge.from.nodeId);
		linked.add(edge.to.nodeId);
	}
	return document.nodes.filter((node) => !linked.has(node.id));
}

function findCanvasCycles(document: CanvasDocument): string[][] {
	const adjacency = new Map<string, string[]>();
	for (const edge of document.edges) {
		const list = adjacency.get(edge.from.nodeId) ?? [];
		list.push(edge.to.nodeId);
		adjacency.set(edge.from.nodeId, list);
	}
	const cycles: string[][] = [];
	const visit = (nodeId: string, path: string[]) => {
		if (path.includes(nodeId)) {
			cycles.push([...path.slice(path.indexOf(nodeId)), nodeId]);
			return;
		}
		for (const next of adjacency.get(nodeId) ?? []) {
			visit(next, [...path, nodeId]);
		}
	};
	for (const node of document.nodes) visit(node.id, []);
	return cycles;
}

function getCanvasNodeWidth(node: CanvasNode): number {
	return node.size?.width ?? 240;
}

function getCanvasNodeHeight(node: CanvasNode): number {
	return node.size?.height ?? 140;
}

function getCanvasNodeBounds(node: CanvasNode) {
	return {
		x: node.position.x,
		y: node.position.y,
		width: getCanvasNodeWidth(node),
		height: getCanvasNodeHeight(node),
	};
}

function getCanvasGroupBounds(group: CanvasGroup) {
	return {
		x: group.position.x,
		y: group.position.y,
		width: group.size.width,
		height: group.size.height,
	};
}

function createCanvasViewportPayload(args: {
	target: "fit" | "selection" | "node";
	nodes: CanvasNode[];
	groups?: CanvasGroup[];
}) {
	const boxes = [
		...args.nodes.map(getCanvasNodeBounds),
		...(args.groups ?? []).map(getCanvasGroupBounds),
	];
	const minX = boxes.length ? Math.min(...boxes.map((box) => box.x)) : 0;
	const minY = boxes.length ? Math.min(...boxes.map((box) => box.y)) : 0;
	const maxX = boxes.length
		? Math.max(...boxes.map((box) => box.x + box.width))
		: 1;
	const maxY = boxes.length
		? Math.max(...boxes.map((box) => box.y + box.height))
		: 1;
	return {
		ok: true,
		viewport: {
			target: args.target,
			bounds: {
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY,
			},
			nodeIds: args.nodes.map((node) => node.id),
			groupIds: (args.groups ?? []).map((group) => group.id),
		},
	};
}

function getSelectedCanvasViewportEntities(args: {
	document: CanvasDocument;
	selection:
		| {
				nodeIds?: string[];
				edgeIds?: string[];
				groupIds?: string[];
		  }
		| undefined;
	capabilityId: string;
}) {
	const nodeIds = new Set(args.selection?.nodeIds ?? []);
	const groupIds = new Set(args.selection?.groupIds ?? []);
	for (const edgeId of args.selection?.edgeIds ?? []) {
		const edge = args.document.edges.find(
			(candidate) => candidate.id === edgeId,
		);
		if (!edge) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${args.capabilityId} selected missing edge: ${edgeId}`,
			});
		}
		nodeIds.add(edge.from.nodeId);
		nodeIds.add(edge.to.nodeId);
	}
	for (const groupId of groupIds) {
		const group = args.document.groups.find(
			(candidate) => candidate.id === groupId,
		);
		if (!group) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${args.capabilityId} selected missing group: ${groupId}`,
			});
		}
		for (const nodeId of group.nodeIds) nodeIds.add(nodeId);
	}
	if (nodeIds.size === 0 && groupIds.size === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} requires a selected Canvas entity`,
		});
	}
	const nodes = [...nodeIds].map((nodeId) => {
		const node = args.document.nodes.find(
			(candidate) => candidate.id === nodeId,
		);
		if (!node) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${args.capabilityId} selected missing node: ${nodeId}`,
			});
		}
		return node;
	});
	const groups = [...groupIds]
		.map((groupId) =>
			args.document.groups.find((candidate) => candidate.id === groupId),
		)
		.filter((group): group is CanvasGroup => Boolean(group));
	return { nodes, groups };
}

function requireSelectedCanvasNodes(
	document: CanvasDocument,
	nodeIds: string[] | undefined,
	minCount: number,
	capabilityId: string,
): CanvasNode[] {
	const selectedNodeIds = nodeIds ?? [];
	if (selectedNodeIds.length < minCount) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${capabilityId} requires at least ${minCount} selected node(s)`,
		});
	}
	const nodes = selectedNodeIds.map((nodeId) => {
		const node = document.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${capabilityId} selected missing node: ${nodeId}`,
			});
		}
		return node;
	});
	return nodes;
}

function createCanvasCapabilityBatch(args: {
	document: CanvasDocument;
	baseVersion: number;
	capabilityId: string;
	mutations: CanvasMutation[];
}): CanvasMutationBatch {
	if (args.mutations.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} produced no Canvas mutations`,
		});
	}
	return canvasMutationBatchSchema.parse({
		id: randomUUID(),
		canvasId: args.document.id,
		baseVersion: args.baseVersion,
		createdAt: new Date().toISOString(),
		actor: {
			id: "host-service-capability",
			type: "system",
			label: `Canvas capability: ${args.capabilityId}`,
		},
		mutations: args.mutations,
	});
}

function persistCanvasCapabilityMutations(args: {
	ctx: { db: HostDb };
	workspace: CanvasStorageWorkspace;
	workspaceId: string;
	document: CanvasDocument;
	capabilityId: string;
	mutations: CanvasMutation[];
}) {
	const batch = createCanvasCapabilityBatch({
		document: args.document,
		baseVersion: readCanvasPatchBatches(
			args.workspace.worktreePath,
			args.document.id,
		).length,
		capabilityId: args.capabilityId,
		mutations: args.mutations,
	});
	return {
		ok: true as const,
		capabilityId: args.capabilityId,
		...persistCanvasHistoryBatch({
			ctx: args.ctx,
			workspace: args.workspace,
			workspaceId: args.workspaceId,
			batch,
		}),
	};
}

function createAlignMutations(args: {
	document: CanvasDocument;
	capabilityId: string;
	nodeIds: string[] | undefined;
	align: "left" | "center" | "right";
}): CanvasMutation[] {
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		2,
		args.capabilityId,
	);
	const targetX =
		args.align === "left"
			? Math.min(...nodes.map((node) => node.position.x))
			: args.align === "right"
				? Math.max(
						...nodes.map((node) => node.position.x + getCanvasNodeWidth(node)),
					)
				: nodes.reduce(
						(sum, node) => sum + node.position.x + getCanvasNodeWidth(node) / 2,
						0,
					) / nodes.length;
	return nodes
		.map((node): CanvasMutation | null => {
			const nextX =
				args.align === "left"
					? targetX
					: args.align === "right"
						? targetX - getCanvasNodeWidth(node)
						: targetX - getCanvasNodeWidth(node) / 2;
			if (node.position.x === nextX) return null;
			return {
				type: "node.update",
				nodeId: node.id,
				patch: { position: { x: nextX, y: node.position.y } },
			};
		})
		.filter((mutation): mutation is CanvasMutation => Boolean(mutation));
}

function createDistributeMutations(args: {
	document: CanvasDocument;
	capabilityId: string;
	nodeIds: string[] | undefined;
	axis: "horizontal" | "vertical";
}): CanvasMutation[] {
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		3,
		args.capabilityId,
	).sort((a, b) =>
		args.axis === "horizontal"
			? a.position.x - b.position.x
			: a.position.y - b.position.y,
	);
	const first = nodes[0];
	const last = nodes.at(-1);
	if (!first || !last) return [];
	const start =
		args.axis === "horizontal" ? first.position.x : first.position.y;
	const end = args.axis === "horizontal" ? last.position.x : last.position.y;
	const step = (end - start) / (nodes.length - 1);
	return nodes
		.slice(1, -1)
		.map((node, index): CanvasMutation | null => {
			const nextPosition =
				args.axis === "horizontal"
					? { x: start + step * (index + 1), y: node.position.y }
					: { x: node.position.x, y: start + step * (index + 1) };
			if (
				node.position.x === nextPosition.x &&
				node.position.y === nextPosition.y
			) {
				return null;
			}
			return {
				type: "node.update",
				nodeId: node.id,
				patch: { position: nextPosition },
			};
		})
		.filter((mutation): mutation is CanvasMutation => Boolean(mutation));
}

function createGroupSelectionMutation(args: {
	document: CanvasDocument;
	nodeIds: string[] | undefined;
	capabilityId: string;
}): CanvasMutation[] {
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		2,
		args.capabilityId,
	);
	const minX = Math.min(...nodes.map((node) => node.position.x));
	const minY = Math.min(...nodes.map((node) => node.position.y));
	const maxX = Math.max(
		...nodes.map((node) => node.position.x + getCanvasNodeWidth(node)),
	);
	const maxY = Math.max(
		...nodes.map((node) => node.position.y + getCanvasNodeHeight(node)),
	);
	return [
		{
			type: "group.add",
			group: {
				id: `group-${randomUUID()}`,
				title: "Canvas group",
				position: { x: minX - 32, y: minY - 32 },
				size: {
					width: maxX - minX + 64,
					height: maxY - minY + 64,
				},
				nodeIds: nodes.map((node) => node.id),
				collapsed: false,
				metadata: {},
			},
		},
	];
}

function createLinkSelectedNodesMutations(args: {
	document: CanvasDocument;
	nodeIds: string[] | undefined;
	capabilityId: string;
}): CanvasMutation[] {
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		2,
		args.capabilityId,
	);
	const existingPairs = new Set(
		args.document.edges.map((edge) => `${edge.from.nodeId}->${edge.to.nodeId}`),
	);
	return nodes
		.slice(0, -1)
		.map((node, index): CanvasMutation | null => {
			const next = nodes[index + 1];
			if (!next) return null;
			const key = `${node.id}->${next.id}`;
			if (existingPairs.has(key)) return null;
			return {
				type: "edge.add",
				edge: {
					id: `edge-${randomUUID()}`,
					from: { nodeId: node.id, side: "right" },
					to: { nodeId: next.id, side: "left" },
					directed: true,
					metadata: {},
				},
			};
		})
		.filter((mutation): mutation is CanvasMutation => Boolean(mutation));
}

function createColorSelectionMutations(args: {
	document: CanvasDocument;
	color: CanvasColor | undefined;
	selection:
		| {
				nodeIds?: string[];
				edgeIds?: string[];
				groupIds?: string[];
		  }
		| undefined;
}): CanvasMutation[] {
	if (!args.color) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "canvas.colorSelection requires a color",
		});
	}
	const mutations: CanvasMutation[] = [];
	for (const nodeId of args.selection?.nodeIds ?? []) {
		if (!args.document.nodes.some((node) => node.id === nodeId)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `canvas.colorSelection selected missing node: ${nodeId}`,
			});
		}
		mutations.push({
			type: "node.update",
			nodeId,
			patch: { color: args.color },
		});
	}
	for (const edgeId of args.selection?.edgeIds ?? []) {
		if (!args.document.edges.some((edge) => edge.id === edgeId)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `canvas.colorSelection selected missing edge: ${edgeId}`,
			});
		}
		mutations.push({
			type: "edge.update",
			edgeId,
			patch: { color: args.color },
		});
	}
	for (const groupId of args.selection?.groupIds ?? []) {
		if (!args.document.groups.some((group) => group.id === groupId)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `canvas.colorSelection selected missing group: ${groupId}`,
			});
		}
		mutations.push({
			type: "group.update",
			groupId,
			patch: { color: args.color },
		});
	}
	return mutations;
}

function createTagSelectionMutations(args: {
	document: CanvasDocument;
	tags: string[] | undefined;
	nodeIds: string[] | undefined;
}): CanvasMutation[] {
	const tags = [...new Set(args.tags ?? [])];
	if (tags.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "canvas.tagSelection requires at least one tag",
		});
	}
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		1,
		"canvas.tagSelection",
	);
	return nodes
		.map((node): CanvasMutation | null => {
			const nextTags = [...new Set([...node.tags, ...tags])];
			if (nextTags.length === node.tags.length) return null;
			return {
				type: "node.update",
				nodeId: node.id,
				patch: { tags: nextTags },
			};
		})
		.filter((mutation): mutation is CanvasMutation => Boolean(mutation));
}

function resolveSelectedLinkedCanvasRef(args: {
	document: CanvasDocument;
	workspaceId: string;
	nodeIds: string[] | undefined;
	capabilityId: string;
	refType: CanvasNodeRef["type"];
}) {
	const nodes = requireSelectedCanvasNodes(
		args.document,
		args.nodeIds,
		1,
		args.capabilityId,
	);
	const node = nodes.find((candidate) => candidate.ref?.type === args.refType);
	if (!node?.ref) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} requires a selected ${args.refType} ref`,
		});
	}
	validateCanvasNodeRefAccess(node.ref, args.workspaceId);
	return {
		ok: true,
		action: "open-linked-ref",
		nodeId: node.id,
		ref: node.ref,
		preview: node.ref.preview ?? node.ref.path ?? node.ref.url ?? node.ref.id,
	};
}

function requireCapabilityStringInput(args: {
	value: string | undefined;
	field: string;
	capabilityId: string;
}) {
	const value = args.value?.trim();
	if (!value) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} requires ${args.field}`,
		});
	}
	return value;
}

function requireCapabilityHttpUrl(
	value: string | undefined,
	capabilityId: string,
) {
	const url = requireCapabilityStringInput({
		value,
		field: "url",
		capabilityId,
	});
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${capabilityId} requires an http(s) URL`,
			});
		}
		return parsed.toString();
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${capabilityId} requires a valid URL`,
		});
	}
}

function getNextCanvasNodePosition(document: CanvasDocument, offset = 0) {
	const index = document.nodes.length + offset;
	return {
		x: (index % 4) * 280,
		y: Math.floor(index / 4) * 180,
	};
}

function createCapturedCanvasNodeMutation(args: {
	document: CanvasDocument;
	offset?: number;
	nodeType: CanvasNode["type"];
	title: string;
	text?: string;
	ref?: CanvasNodeRef;
}): CanvasMutation {
	if (args.ref) {
		validateCanvasNodeRefAccess(args.ref, args.document.workspaceId);
	}
	return {
		type: "node.add",
		node: {
			id: `${args.nodeType}-${randomUUID()}`,
			type: args.nodeType,
			position: getNextCanvasNodePosition(args.document, args.offset ?? 0),
			size: { width: 240, height: 140 },
			title: args.title,
			text: args.text,
			ref: args.ref,
			tags: [],
			locked: false,
			collapsed: false,
			metadata: {},
		},
	};
}

function createMarkdownImportMutations(args: {
	document: CanvasDocument;
	markdown: string | undefined;
	title: string | undefined;
	capabilityId: string;
}): CanvasMutation[] {
	const markdown = requireCapabilityStringInput({
		value: args.markdown,
		field: "markdown",
		capabilityId: args.capabilityId,
	});
	if (markdown.length > 200_000) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: `${args.capabilityId} markdown payload is too large`,
		});
	}
	const blocks = markdown
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.slice(0, 100);
	if (blocks.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} produced no markdown nodes`,
		});
	}
	return blocks.map((block, index) => {
		const heading = block.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
		return createCapturedCanvasNodeMutation({
			document: args.document,
			offset: index,
			nodeType: "text",
			title: heading ?? args.title ?? `Markdown ${index + 1}`,
			text: block,
		});
	});
}

function createJsonCanvasImportMutations(args: {
	document: CanvasDocument;
	jsonCanvas: unknown;
	title: string | undefined;
	capabilityId: string;
}) {
	if (args.jsonCanvas === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${args.capabilityId} requires jsonCanvas`,
		});
	}
	const imported = importJsonCanvas({
		canvasId: args.document.id,
		workspaceId: args.document.workspaceId,
		projectId: args.document.projectId,
		title: args.title ?? args.document.title,
		now: new Date().toISOString(),
		jsonCanvas: args.jsonCanvas,
	});
	const usedNodeIds = new Set(args.document.nodes.map((node) => node.id));
	const usedEdgeIds = new Set(args.document.edges.map((edge) => edge.id));
	const usedGroupIds = new Set(args.document.groups.map((group) => group.id));
	const nodeIdMap = new Map<string, string>();
	const groupIdMap = new Map<string, string>();
	const uniqueId = (preferred: string, used: Set<string>, prefix: string) => {
		if (!used.has(preferred)) {
			used.add(preferred);
			return preferred;
		}
		const id = `${prefix}-${randomUUID()}`;
		used.add(id);
		return id;
	};
	for (const node of imported.document.nodes) {
		nodeIdMap.set(node.id, uniqueId(node.id, usedNodeIds, "imported-node"));
	}
	for (const group of imported.document.groups) {
		groupIdMap.set(
			group.id,
			uniqueId(group.id, usedGroupIds, "imported-group"),
		);
	}
	const mutations: CanvasMutation[] = [
		...imported.document.nodes.map((node): CanvasMutation => {
			const nodeId = nodeIdMap.get(node.id) ?? node.id;
			return {
				type: "node.add",
				node: {
					...node,
					id: nodeId,
					groupId: undefined,
					position: {
						x: node.position.x + 40,
						y: node.position.y + 40,
					},
				},
			};
		}),
		...imported.document.edges
			.map((edge): CanvasMutation | null => {
				const fromNodeId = nodeIdMap.get(edge.from.nodeId);
				const toNodeId = nodeIdMap.get(edge.to.nodeId);
				if (!fromNodeId || !toNodeId) return null;
				return {
					type: "edge.add",
					edge: {
						...edge,
						id: uniqueId(edge.id, usedEdgeIds, "imported-edge"),
						from: { ...edge.from, nodeId: fromNodeId },
						to: { ...edge.to, nodeId: toNodeId },
					},
				};
			})
			.filter((mutation): mutation is CanvasMutation => Boolean(mutation)),
		...imported.document.groups.map(
			(group): CanvasMutation => ({
				type: "group.add",
				group: {
					...group,
					id: groupIdMap.get(group.id) ?? group.id,
					position: {
						x: group.position.x + 40,
						y: group.position.y + 40,
					},
					nodeIds: group.nodeIds
						.map((nodeId) => nodeIdMap.get(nodeId))
						.filter((nodeId): nodeId is string => Boolean(nodeId)),
				},
			}),
		),
	];
	return { mutations, report: imported.report };
}

function renderCanvasMarkdownMap(document: CanvasDocument): string {
	const lines = [
		`# ${document.title}`,
		"",
		document.description ?? "",
		"",
		`- Canvas: ${document.id}`,
		`- Nodes: ${document.nodes.length}`,
		`- Edges: ${document.edges.length}`,
		`- Groups: ${document.groups.length}`,
		"",
		"## Nodes",
	];
	for (const node of document.nodes) {
		lines.push(
			`- ${node.title ?? node.id} (${node.type})${node.ref ? ` -> ${node.ref.type}:${node.ref.id}` : ""}`,
		);
		if (node.text) lines.push(`  - ${node.text}`);
	}
	lines.push("", "## Edges");
	for (const edge of document.edges) {
		lines.push(
			`- ${edge.from.nodeId} -> ${edge.to.nodeId}${edge.label ? `: ${edge.label}` : ""}`,
		);
	}
	return lines
		.filter((line, index) => line.length > 0 || lines[index - 1] !== "")
		.join("\n");
}

function matchesCanvasQuery(
	query: string,
	values: Array<string | undefined>,
): boolean {
	if (!query) return false;
	return values.some((value) => value?.toLowerCase().includes(query));
}

function persistCanvasHistoryBatch(args: {
	ctx: { db: HostDb };
	workspace: CanvasStorageWorkspace;
	workspaceId: string;
	batch: CanvasMutationBatch;
	eventType?: CanvasWatchEventType;
}) {
	const result = applyAndPersistCanvasMutationBatch({
		worktreePath: args.workspace.worktreePath,
		batch: args.batch,
	});
	ensureCanvasBelongsToWorkspace(result.document, args.workspaceId);
	const summary = summarizeCanvasDocument(
		args.workspace.worktreePath,
		result.document,
		result.revision,
	);
	upsertCanvasIndex(args.ctx, summary);
	emitCanvasWatchEvent({
		type: args.eventType ?? "patch",
		workspaceId: args.workspaceId,
		canvasId: args.batch.canvasId,
		revision: summary.revision,
		index: summary,
	});
	return { document: result.document, index: summary, batch: args.batch };
}

export const canvasRouter = router({
	list: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.query(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const rows = ctx.db.query.canvasDocuments
				.findMany({ where: eq(canvasDocuments.workspaceId, input.workspaceId) })
				.sync();
			if (rows.length > 0) return rows.map(parseIndexRow);
			return reindexWorkspaceCanvases(ctx, workspace);
		}),

	get: protectedProcedure
		.input(workspaceCanvasInput)
		.query(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const document = ensureCanvasBelongsToWorkspace(
				readCanvasDocument(workspace.worktreePath, input.canvasId),
				input.workspaceId,
			);
			const row = ctx.db.query.canvasDocuments
				.findFirst({
					where: and(
						eq(canvasDocuments.id, input.canvasId),
						eq(canvasDocuments.workspaceId, input.workspaceId),
					),
				})
				.sync();
			return {
				document,
				index: row ? parseIndexRow(row) : null,
				snapshots: listCanvasSnapshots(workspace.worktreePath, input.canvasId),
			};
		}),

	watch: protectedProcedure
		.input(workspaceCanvasInput)
		.subscription(async function* ({ ctx, input, signal }) {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			const queue: CanvasWatchEvent[] = [];
			let resolve: (() => void) | null = null;
			const wake = () => {
				resolve?.();
				resolve = null;
			};
			const onEvent = (event: CanvasWatchEvent) => {
				if (
					event.workspaceId !== input.workspaceId ||
					event.canvasId !== input.canvasId
				) {
					return;
				}
				queue.push(event);
				wake();
			};

			canvasWatchEmitter.on(CANVAS_WATCH_EVENT, onEvent);
			signal?.addEventListener("abort", wake);

			try {
				while (!signal?.aborted) {
					while (queue.length > 0) {
						const event = queue.shift();
						if (event) yield event;
					}
					await new Promise<void>((done) => {
						if (signal?.aborted) {
							done();
							return;
						}
						resolve = done;
					});
				}
			} finally {
				canvasWatchEmitter.off(CANVAS_WATCH_EVENT, onEvent);
				signal?.removeEventListener("abort", wake);
			}
		}),

	unwatch: protectedProcedure
		.input(workspaceCanvasInput)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			return {
				success: true as const,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			};
		}),

	create: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				canvasId: canvasIdInput.optional(),
				title: z.string().min(1).optional(),
				description: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const document = createCanvasDocument({
				workspace,
				canvasId: input.canvasId ?? randomUUID(),
				title: input.title,
				description: input.description,
			});
			const summary = summarizeCanvasDocument(
				workspace.worktreePath,
				document,
				0,
			);
			upsertCanvasIndex(ctx, summary);
			emitCanvasWatchEvent({
				type: "create",
				workspaceId: input.workspaceId,
				canvasId: document.id,
				revision: summary.revision,
				index: summary,
			});
			return { document, index: summary };
		}),

	update: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				canvasId: canvasIdInput,
				patch: z.object({
					title: z.string().min(1).optional(),
					description: z.string().optional(),
					tags: z.array(z.string().min(1)).optional(),
					metadata: z.record(z.string(), z.unknown()).optional(),
				}),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			const currentRow = ctx.db.query.canvasDocuments
				.findFirst({ where: eq(canvasDocuments.id, input.canvasId) })
				.sync();
			const batch = canvasMutationBatchSchema.parse({
				id: randomUUID(),
				canvasId: input.canvasId,
				baseVersion: currentRow?.revision ?? 0,
				createdAt: new Date().toISOString(),
				actor: { id: "host-service", type: "system", label: "Host Service" },
				mutations: [{ type: "document.update", patch: input.patch }],
			});
			const result = applyAndPersistCanvasMutationBatch({
				worktreePath: workspace.worktreePath,
				batch,
			});
			ensureCanvasBelongsToWorkspace(result.document, input.workspaceId);
			const summary = summarizeCanvasDocument(
				workspace.worktreePath,
				result.document,
				result.revision,
			);
			upsertCanvasIndex(ctx, summary);
			emitCanvasWatchEvent({
				type: "update",
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
				revision: summary.revision,
				index: summary,
			});
			return { document: result.document, index: summary };
		}),

	patch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				batch: canvasMutationBatchSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.batch.canvasId,
			});
			validateCanvasMutationBatchSecurityScope(input.batch, input.workspaceId);
			const result = applyAndPersistCanvasMutationBatch({
				worktreePath: workspace.worktreePath,
				batch: input.batch,
			});
			ensureCanvasBelongsToWorkspace(result.document, input.workspaceId);
			const summary = summarizeCanvasDocument(
				workspace.worktreePath,
				result.document,
				result.revision,
			);
			upsertCanvasIndex(ctx, summary);
			emitCanvasWatchEvent({
				type: "patch",
				workspaceId: input.workspaceId,
				canvasId: input.batch.canvasId,
				revision: summary.revision,
				index: summary,
			});
			return { document: result.document, index: summary };
		}),

	undo: protectedProcedure
		.input(workspaceCanvasInput)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			const patches = readCanvasPatchBatches(
				workspace.worktreePath,
				input.canvasId,
			);
			const targetPatch = findPersistedUndoTarget(patches);
			if (!targetPatch) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Canvas has no persisted mutation history to undo",
				});
			}
			const documentBeforeTarget = ensureCanvasBelongsToWorkspace(
				readCanvasDocumentAtRevision(
					workspace.worktreePath,
					input.canvasId,
					targetPatch.index,
				),
				input.workspaceId,
			);
			const batch = canvasMutationBatchSchema.parse({
				...createInverseCanvasMutationBatch({
					document: documentBeforeTarget,
					batch: targetPatch.batch,
					baseVersion: patches.length,
					actorId: "host-service-undo",
				}),
				history: { kind: "undo", targetBatchId: targetPatch.batch.id },
			});
			return {
				...persistCanvasHistoryBatch({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					batch,
					eventType: "undo",
				}),
				undoneBatch: targetPatch.batch,
			};
		}),

	redo: protectedProcedure
		.input(workspaceCanvasInput)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			const patches = readCanvasPatchBatches(
				workspace.worktreePath,
				input.canvasId,
			);
			const redoTarget = findPersistedRedoTarget(patches);
			if (!redoTarget || !isUndoBatchActor(redoTarget.batch.actor.id)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Canvas has no persisted undo mutation to redo",
				});
			}
			const documentBeforeUndo = ensureCanvasBelongsToWorkspace(
				readCanvasDocumentAtRevision(
					workspace.worktreePath,
					input.canvasId,
					redoTarget.index,
				),
				input.workspaceId,
			);
			const batch = canvasMutationBatchSchema.parse({
				...createInverseCanvasMutationBatch({
					document: documentBeforeUndo,
					batch: redoTarget.batch,
					baseVersion: patches.length,
					actorId: "host-service-redo",
				}),
				history: { kind: "redo", targetBatchId: redoTarget.targetBatchId },
			});
			return {
				...persistCanvasHistoryBatch({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					batch,
					eventType: "redo",
				}),
				redoneBatch: redoTarget.batch,
			};
		}),

	delete: protectedProcedure
		.input(workspaceCanvasInput)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const row = ctx.db.query.canvasDocuments
				.findFirst({
					where: and(
						eq(canvasDocuments.id, input.canvasId),
						eq(canvasDocuments.workspaceId, input.workspaceId),
					),
				})
				.sync();
			if (!row) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Canvas not found" });
			}
			deleteCanvasDocument(workspace.worktreePath, input.canvasId);
			ctx.db
				.delete(canvasDocuments)
				.where(eq(canvasDocuments.id, input.canvasId))
				.run();
			emitCanvasWatchEvent({
				type: "delete",
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
				revision: null,
				index: null,
			});
			return { success: true as const };
		}),

	snapshot: protectedProcedure
		.input(workspaceCanvasInput.extend({ label: z.string().optional() }))
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			return createCanvasSnapshot({
				worktreePath: workspace.worktreePath,
				canvasId: input.canvasId,
				label: input.label,
			});
		}),

	importJsonCanvas: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				canvasId: canvasIdInput.optional(),
				title: z.string().min(1).optional(),
				jsonCanvas: z.unknown(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const { document, report } = importJsonCanvas({
				canvasId: input.canvasId ?? randomUUID(),
				workspaceId: workspace.id,
				projectId: workspace.projectId,
				title: input.title ?? "Imported JSON Canvas",
				jsonCanvas: input.jsonCanvas,
			});
			initializeCanvasDocument(workspace.worktreePath, document);
			const summary = summarizeCanvasDocument(
				workspace.worktreePath,
				document,
				0,
			);
			upsertCanvasIndex(ctx, summary);
			emitCanvasWatchEvent({
				type: "import",
				workspaceId: input.workspaceId,
				canvasId: document.id,
				revision: summary.revision,
				index: summary,
			});
			return { document, index: summary, report };
		}),

	exportJsonCanvas: protectedProcedure
		.input(workspaceCanvasInput)
		.query(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const document = ensureCanvasBelongsToWorkspace(
				readCanvasDocument(workspace.worktreePath, input.canvasId),
				input.workspaceId,
			);
			return exportJsonCanvas(document);
		}),

	restore: protectedProcedure
		.input(workspaceCanvasInput.extend({ snapshotId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			const document = ensureCanvasBelongsToWorkspace(
				restoreCanvasSnapshot({
					worktreePath: workspace.worktreePath,
					canvasId: input.canvasId,
					snapshotId: input.snapshotId,
				}),
				input.workspaceId,
			);
			const currentRow = ctx.db.query.canvasDocuments
				.findFirst({ where: eq(canvasDocuments.id, input.canvasId) })
				.sync();
			const summary = summarizeCanvasDocument(
				workspace.worktreePath,
				document,
				currentRow?.revision ?? 0,
			);
			upsertCanvasIndex(ctx, summary);
			emitCanvasWatchEvent({
				type: "restore",
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
				revision: summary.revision,
				index: summary,
			});
			return { document, index: summary };
		}),

	search: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1), query: z.string() }))
		.query(({ ctx, input }) => {
			requireWorkspace(ctx, input.workspaceId);
			return ctx.db.query.canvasDocuments
				.findMany({
					where: and(
						eq(canvasDocuments.workspaceId, input.workspaceId),
						like(canvasDocuments.title, `%${input.query}%`),
					),
				})
				.sync()
				.map(parseIndexRow);
		}),

	index: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			return reindexWorkspaceCanvases(ctx, workspace);
		}),

	listCapabilities: protectedProcedure.query(() => builtInCanvasCapabilities),

	runCapability: protectedProcedure
		.input(
			workspaceCanvasInput.extend({
				capabilityId: z.string().min(1),
				query: z.string().optional(),
				title: z.string().min(1).optional(),
				text: z.string().optional(),
				url: z.string().min(1).optional(),
				path: z.string().min(1).optional(),
				refId: z.string().min(1).optional(),
				markdown: z.string().optional(),
				jsonCanvas: z.unknown().optional(),
				nodeType: z.string().optional(),
				tag: z.string().optional(),
				sessionId: z.string().optional(),
				selection: z
					.object({
						nodeIds: z.array(z.string().min(1)).optional(),
						edgeIds: z.array(z.string().min(1)).optional(),
						groupIds: z.array(z.string().min(1)).optional(),
					})
					.optional(),
				tags: z.array(z.string().min(1)).optional(),
				color: z
					.object({
						key: z.string().min(1).optional(),
						value: z.string().min(1).optional(),
					})
					.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const document = ensureCanvasBelongsToWorkspace(
				readCanvasDocument(workspace.worktreePath, input.canvasId),
				input.workspaceId,
			);
			if (input.capabilityId === "canvas.zoomToFit") {
				return createCanvasViewportPayload({
					target: "fit",
					nodes: document.nodes,
					groups: document.groups,
				});
			}
			if (input.capabilityId === "canvas.zoomToSelection") {
				return createCanvasViewportPayload({
					target: "selection",
					...getSelectedCanvasViewportEntities({
						document,
						selection: input.selection,
						capabilityId: input.capabilityId,
					}),
				});
			}
			if (input.capabilityId === "canvas.focusNode") {
				const nodes = requireSelectedCanvasNodes(
					document,
					input.selection?.nodeIds,
					1,
					input.capabilityId,
				);
				const node = nodes[0];
				if (!node) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `${input.capabilityId} requires a selected CanvasNode`,
					});
				}
				return {
					...createCanvasViewportPayload({
						target: "node",
						nodes: [node],
					}),
					nodeId: node.id,
					center: {
						x: node.position.x + getCanvasNodeWidth(node) / 2,
						y: node.position.y + getCanvasNodeHeight(node) / 2,
					},
				};
			}
			if (input.capabilityId === "canvas.openLinkedSession") {
				return resolveSelectedLinkedCanvasRef({
					document,
					workspaceId: input.workspaceId,
					nodeIds: input.selection?.nodeIds,
					capabilityId: input.capabilityId,
					refType: "session",
				});
			}
			if (input.capabilityId === "canvas.openLinkedNote") {
				return resolveSelectedLinkedCanvasRef({
					document,
					workspaceId: input.workspaceId,
					nodeIds: input.selection?.nodeIds,
					capabilityId: input.capabilityId,
					refType: "note",
				});
			}
			if (input.capabilityId === "canvas.openLinkedArtifact") {
				return resolveSelectedLinkedCanvasRef({
					document,
					workspaceId: input.workspaceId,
					nodeIds: input.selection?.nodeIds,
					capabilityId: input.capabilityId,
					refType: "artifact",
				});
			}
			if (input.capabilityId === "canvas.exportJsonCanvas") {
				return exportJsonCanvas(document);
			}
			if (input.capabilityId === "canvas.exportMarkdownMap") {
				return { ok: true, markdown: renderCanvasMarkdownMap(document) };
			}
			if (input.capabilityId === "canvas.exportBundle") {
				return {
					ok: true,
					document,
					patches: readCanvasPatchBatches(
						workspace.worktreePath,
						input.canvasId,
					),
					snapshots: listCanvasSnapshots(
						workspace.worktreePath,
						input.canvasId,
					),
				};
			}
			if (input.capabilityId === "canvas.exportSelection") {
				const nodeIds = new Set(input.selection?.nodeIds ?? []);
				const edgeIds = new Set(input.selection?.edgeIds ?? []);
				const groupIds = new Set(input.selection?.groupIds ?? []);
				return {
					ok: true,
					nodes: document.nodes.filter((node) => nodeIds.has(node.id)),
					edges: document.edges.filter((edge) => edgeIds.has(edge.id)),
					groups: document.groups.filter((group) => groupIds.has(group.id)),
				};
			}
			if (input.capabilityId === "canvas.importJsonCanvas") {
				const imported = createJsonCanvasImportMutations({
					document,
					jsonCanvas: input.jsonCanvas,
					title: input.title,
					capabilityId: input.capabilityId,
				});
				return {
					...persistCanvasCapabilityMutations({
						ctx,
						workspace,
						workspaceId: input.workspaceId,
						document,
						capabilityId: input.capabilityId,
						mutations: imported.mutations,
					}),
					report: imported.report,
				};
			}
			if (input.capabilityId === "canvas.importMarkdownAsNodes") {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createMarkdownImportMutations({
						document,
						markdown: input.markdown,
						title: input.title,
						capabilityId: input.capabilityId,
					}),
				});
			}
			if (input.capabilityId === "canvas.captureSession") {
				const sessionId = requireCapabilityStringInput({
					value: input.sessionId ?? input.refId,
					field: "sessionId",
					capabilityId: input.capabilityId,
				});
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [
						createCapturedCanvasNodeMutation({
							document,
							nodeType: "chat-session",
							title: input.title ?? "Chat session",
							ref: { type: "session", id: sessionId },
						}),
					],
				});
			}
			if (input.capabilityId === "canvas.captureMessage") {
				const messageId = requireCapabilityStringInput({
					value: input.refId,
					field: "refId",
					capabilityId: input.capabilityId,
				});
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [
						createCapturedCanvasNodeMutation({
							document,
							nodeType: "message",
							title: input.title ?? "Message",
							text: input.text,
							ref: { type: "message", id: messageId },
						}),
					],
				});
			}
			if (input.capabilityId === "canvas.captureArtifact") {
				const artifactId = requireCapabilityStringInput({
					value: input.refId,
					field: "refId",
					capabilityId: input.capabilityId,
				});
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [
						createCapturedCanvasNodeMutation({
							document,
							nodeType: "artifact",
							title: input.title ?? "Artifact",
							text: input.text,
							ref: { type: "artifact", id: artifactId },
						}),
					],
				});
			}
			if (input.capabilityId === "canvas.captureFile") {
				const path = requireCapabilityStringInput({
					value: input.path,
					field: "path",
					capabilityId: input.capabilityId,
				});
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [
						createCapturedCanvasNodeMutation({
							document,
							nodeType: "file",
							title: input.title ?? path.split(/[\\/]+/).at(-1) ?? "File",
							ref: { type: "file", id: input.refId ?? path, path },
						}),
					],
				});
			}
			if (input.capabilityId === "canvas.captureUrl") {
				const url = requireCapabilityHttpUrl(input.url, input.capabilityId);
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [
						createCapturedCanvasNodeMutation({
							document,
							nodeType: "url",
							title: input.title ?? url,
							text: input.text,
							ref: { type: "url", id: input.refId ?? url, url },
						}),
					],
				});
			}
			if (input.capabilityId === "canvas.captureClipboard") {
				const text = requireCapabilityStringInput({
					value: input.text,
					field: "text",
					capabilityId: input.capabilityId,
				});
				let mutation: CanvasMutation;
				try {
					const url = requireCapabilityHttpUrl(text, input.capabilityId);
					mutation = createCapturedCanvasNodeMutation({
						document,
						nodeType: "url",
						title: input.title ?? url,
						ref: { type: "url", id: input.refId ?? url, url },
					});
				} catch {
					mutation = createCapturedCanvasNodeMutation({
						document,
						nodeType: "text",
						title: input.title ?? "Clipboard",
						text,
					});
				}
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [mutation],
				});
			}
			if (
				input.capabilityId === "canvas.autoLayout" ||
				input.capabilityId === "canvas.cleanLayout"
			) {
				const columns = Math.max(
					1,
					Math.ceil(Math.sqrt(document.nodes.length)),
				);
				const mutations = document.nodes
					.map((node, index): CanvasMutation | null => {
						const nextPosition = {
							x: (index % columns) * 280,
							y: Math.floor(index / columns) * 180,
						};
						if (
							node.position.x === nextPosition.x &&
							node.position.y === nextPosition.y
						) {
							return null;
						}
						return {
							type: "node.update",
							nodeId: node.id,
							patch: { position: nextPosition },
						};
					})
					.filter((mutation): mutation is CanvasMutation => Boolean(mutation));
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations,
				});
			}
			if (
				input.capabilityId === "canvas.alignLeft" ||
				input.capabilityId === "canvas.alignCenter" ||
				input.capabilityId === "canvas.alignRight"
			) {
				const align =
					input.capabilityId === "canvas.alignLeft"
						? "left"
						: input.capabilityId === "canvas.alignRight"
							? "right"
							: "center";
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createAlignMutations({
						document,
						capabilityId: input.capabilityId,
						nodeIds: input.selection?.nodeIds,
						align,
					}),
				});
			}
			if (
				input.capabilityId === "canvas.distributeHorizontal" ||
				input.capabilityId === "canvas.distributeVertical"
			) {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createDistributeMutations({
						document,
						capabilityId: input.capabilityId,
						nodeIds: input.selection?.nodeIds,
						axis:
							input.capabilityId === "canvas.distributeHorizontal"
								? "horizontal"
								: "vertical",
					}),
				});
			}
			if (input.capabilityId === "canvas.groupSelection") {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createGroupSelectionMutation({
						document,
						nodeIds: input.selection?.nodeIds,
						capabilityId: input.capabilityId,
					}),
				});
			}
			if (input.capabilityId === "canvas.ungroupSelection") {
				const groupIds = new Set(input.selection?.groupIds ?? []);
				for (const node of document.nodes) {
					if (node.groupId && input.selection?.nodeIds?.includes(node.id)) {
						groupIds.add(node.groupId);
					}
				}
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: [...groupIds]
						.filter((groupId) =>
							document.groups.some((group) => group.id === groupId),
						)
						.map((groupId) => ({ type: "group.delete", groupId })),
				});
			}
			if (input.capabilityId === "canvas.linkSelectedNodes") {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createLinkSelectedNodesMutations({
						document,
						nodeIds: input.selection?.nodeIds,
						capabilityId: input.capabilityId,
					}),
				});
			}
			if (input.capabilityId === "canvas.colorSelection") {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createColorSelectionMutations({
						document,
						color: input.color,
						selection: input.selection,
					}),
				});
			}
			if (input.capabilityId === "canvas.tagSelection") {
				return persistCanvasCapabilityMutations({
					ctx,
					workspace,
					workspaceId: input.workspaceId,
					document,
					capabilityId: input.capabilityId,
					mutations: createTagSelectionMutations({
						document,
						tags: input.tags,
						nodeIds: input.selection?.nodeIds,
					}),
				});
			}
			if (input.capabilityId === "canvas.searchText") {
				const query = input.query?.trim().toLowerCase() ?? "";
				return {
					ok: true,
					query: input.query ?? "",
					documentMatches: matchesCanvasQuery(query, [
						document.title,
						document.description,
						document.id,
					]),
					nodes: document.nodes.filter((node) =>
						matchesCanvasQuery(query, [
							node.id,
							node.title,
							node.text,
							node.ref?.id,
							node.ref?.preview,
							...node.tags,
						]),
					),
					edges: document.edges.filter((edge) =>
						matchesCanvasQuery(query, [
							edge.id,
							edge.label,
							edge.from.nodeId,
							edge.to.nodeId,
						]),
					),
					groups: document.groups.filter((group) =>
						matchesCanvasQuery(query, [
							group.id,
							group.title,
							...group.nodeIds,
						]),
					),
				};
			}
			if (input.capabilityId === "canvas.filterByType") {
				return {
					ok: true,
					nodeType: input.nodeType ?? null,
					nodes: input.nodeType
						? document.nodes.filter((node) => node.type === input.nodeType)
						: document.nodes,
				};
			}
			if (input.capabilityId === "canvas.filterByTag") {
				return {
					ok: true,
					tag: input.tag ?? null,
					nodes: input.tag
						? document.nodes.filter((node) =>
								node.tags.includes(input.tag ?? ""),
							)
						: document.nodes.filter((node) => node.tags.length > 0),
					documentMatches: input.tag
						? document.tags.includes(input.tag)
						: document.tags.length > 0,
				};
			}
			if (input.capabilityId === "canvas.filterBySession") {
				return {
					ok: true,
					sessionId: input.sessionId ?? null,
					nodes: document.nodes.filter((node) => {
						if (node.type !== "chat-session" && node.ref?.type !== "session") {
							return false;
						}
						if (!input.sessionId) return true;
						return (
							node.id === input.sessionId ||
							node.ref?.id === input.sessionId ||
							node.ref?.workspaceId === input.sessionId
						);
					}),
				};
			}
			if (input.capabilityId === "canvas.showBacklinks") {
				const selectedNodeIds = new Set(input.selection?.nodeIds ?? []);
				return {
					ok: true,
					edges: document.edges.filter(
						(edge) =>
							selectedNodeIds.has(edge.from.nodeId) ||
							selectedNodeIds.has(edge.to.nodeId),
					),
				};
			}
			if (input.capabilityId === "canvas.explainGraph") {
				const orphans = findCanvasOrphanNodes(document);
				const cycles = findCanvasCycles(document);
				return {
					ok: true,
					summary: {
						canvasId: document.id,
						title: document.title,
						nodeCount: document.nodes.length,
						edgeCount: document.edges.length,
						groupCount: document.groups.length,
						orphanCount: orphans.length,
						cycleCount: cycles.length,
					},
					orphans,
					cycles,
				};
			}
			if (input.capabilityId === "canvas.validateDocument") {
				const result = canvasDocumentSchema.safeParse(document);
				return {
					ok: result.success,
					issues: result.success ? [] : result.error.issues,
				};
			}
			if (input.capabilityId === "canvas.validateMutationReplay") {
				const replayed = replayCanvasDocument(
					workspace.worktreePath,
					input.canvasId,
				);
				return {
					ok: JSON.stringify(replayed) === JSON.stringify(document),
					issues: [],
				};
			}
			if (input.capabilityId === "canvas.findOrphans") {
				return {
					ok: true,
					nodes: findCanvasOrphanNodes(document),
				};
			}
			if (input.capabilityId === "canvas.findCycles") {
				const cycles = findCanvasCycles(document);
				return { ok: cycles.length === 0, cycles };
			}
			if (input.capabilityId === "canvas.validateRefs") {
				const issues = document.nodes.flatMap((node) => {
					if (!node.ref) return [];
					if (
						node.ref.workspaceId &&
						node.ref.workspaceId !== input.workspaceId
					) {
						return [
							`node:${node.id}:ref-workspace:${node.ref.workspaceId}:expected:${input.workspaceId}`,
						];
					}
					return [];
				});
				return { ok: issues.length === 0, issues };
			}
			if (input.capabilityId === "canvas.validateSecurityScope") {
				const issues = document.nodes.flatMap((node) => {
					if (!node.ref) return [];
					const nodeIssues: string[] = [];
					if (node.ref.path?.includes("..")) {
						nodeIssues.push(`node:${node.id}:path-traversal`);
					}
					if (
						node.ref.url &&
						!node.ref.url.startsWith("https://") &&
						!node.ref.url.startsWith("http://")
					) {
						nodeIssues.push(`node:${node.id}:unsupported-url-protocol`);
					}
					return nodeIssues;
				});
				return { ok: issues.length === 0, issues };
			}
			if (input.capabilityId === "canvas.validateJsonCanvasRoundtrip") {
				const exported = exportJsonCanvas(document);
				const imported = importJsonCanvas({
					canvasId: document.id,
					workspaceId: document.workspaceId,
					projectId: document.projectId,
					title: document.title,
					now: document.updatedAt,
					jsonCanvas: exported.jsonCanvas,
				});
				return {
					ok:
						imported.document.nodes.length === document.nodes.length &&
						imported.document.edges.length === document.edges.length,
					report: imported.report,
				};
			}
			if (input.capabilityId === "canvas.validateIndex") {
				const row = ctx.db.query.canvasDocuments
					.findFirst({
						where: and(
							eq(canvasDocuments.id, input.canvasId),
							eq(canvasDocuments.workspaceId, input.workspaceId),
						),
					})
					.sync();
				const summary = summarizeCanvasDocument(
					workspace.worktreePath,
					document,
					row?.revision ?? 0,
				);
				const issues = [
					row?.title === summary.title ? null : "title",
					row?.nodeCount === summary.nodeCount ? null : "nodeCount",
					row?.edgeCount === summary.edgeCount ? null : "edgeCount",
					row?.groupCount === summary.groupCount ? null : "groupCount",
				].filter(Boolean);
				return { ok: issues.length === 0, issues };
			}
			const registeredCapability = builtInCanvasCapabilities.find(
				(capability) => capability.id === input.capabilityId,
			);
			if (registeredCapability) {
				return {
					ok: false,
					status: "unavailable",
					capabilityId: input.capabilityId,
					risks: registeredCapability.risks,
					requiresSelection: registeredCapability.requiresSelection,
					emitsMutation: registeredCapability.emitsMutation,
					reason:
						"Canvas capability is registered but requires an external source, agent runtime, or bundle/session payload contract before local execution.",
				};
			}
			throw new TRPCError({
				code: "NOT_IMPLEMENTED",
				message: `Canvas capability is registered but not executable locally yet: ${input.capabilityId}`,
			});
		}),

	getNodeRefs: protectedProcedure
		.input(workspaceCanvasInput)
		.query(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			const document = ensureCanvasBelongsToWorkspace(
				readCanvasDocument(workspace.worktreePath, input.canvasId),
				input.workspaceId,
			);
			return document.nodes
				.filter((node) => node.ref)
				.map((node) => ({ nodeId: node.id, ref: node.ref }));
		}),

	resolveNodeRef: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				ref: z.object({
					type: z.string().min(1),
					id: z.string().min(1),
					workspaceId: z.string().optional(),
					path: z.string().optional(),
					url: z.string().optional(),
				}),
			}),
		)
		.query(({ ctx, input }) => {
			requireWorkspace(ctx, input.workspaceId);
			validateCanvasNodeRefAccess(input.ref, input.workspaceId);
			return {
				ref: input.ref,
				resolved: true,
				preview: input.ref.path ?? input.ref.url ?? input.ref.id,
			};
		}),

	getHistory: protectedProcedure
		.input(workspaceCanvasInput)
		.query(({ ctx, input }) => {
			const workspace = requireWorkspace(ctx, input.workspaceId);
			readWorkspaceCanvasDocument({
				workspace,
				workspaceId: input.workspaceId,
				canvasId: input.canvasId,
			});
			return {
				patches: readCanvasPatchBatches(workspace.worktreePath, input.canvasId),
				snapshots: listCanvasSnapshots(workspace.worktreePath, input.canvasId),
			};
		}),
});
