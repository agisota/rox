import { describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { canvasDocuments } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { canvasRouter } from "./canvas";
import {
	getCanvasDocumentPath,
	readCanvasDocument,
	readCanvasPatchBatches,
} from "./storage";

async function expectCanvasWatchEvent<T>(
	result: Promise<IteratorResult<T>>,
): Promise<T> {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(
			() => reject(new Error("Timed out waiting for Canvas watch event")),
			500,
		);
	});
	const event = await Promise.race([result, timeout]);
	if (event.done) {
		throw new Error("Canvas watch event stream ended before an event arrived");
	}
	return event.value;
}

type TerminalSessionRow = {
	id: string;
	originWorkspaceId: string | null;
	status: string;
	createdAt: number;
	lastAttachedAt: number | null;
	endedAt: number | null;
};

type ProjectRow = {
	id: string;
	repoName: string | null;
	repoOwner: string | null;
};

function createCanvasTestContext() {
	const root = mkdtempSync(join(tmpdir(), "rox-canvas-router-"));
	const worktreePath = join(root, "worktree");
	mkdirSync(worktreePath, { recursive: true });
	const workspace = {
		id: "workspace-1",
		projectId: "project-1",
		worktreePath,
		branch: "main",
		headSha: null,
		upstreamOwner: null,
		upstreamRepo: null,
		upstreamBranch: null,
		pullRequestId: null,
		createdAt: Date.now(),
	};
	const canvasRows: (typeof canvasDocuments.$inferSelect)[] = [];
	const terminalSessionRows: TerminalSessionRow[] = [];
	const projectRows: ProjectRow[] = [
		{ id: "project-1", repoName: "rox", repoOwner: "agisota" },
	];
	const db = {
		query: {
			workspaces: {
				findFirst: () => ({
					sync: () => workspace,
				}),
			},
			terminalSessions: {
				findFirst: () => ({
					sync: () => terminalSessionRows[0] ?? null,
				}),
			},
			projects: {
				findFirst: () => ({
					sync: () => projectRows[0] ?? null,
				}),
			},
			canvasDocuments: {
				findMany: () => ({
					sync: () => canvasRows,
				}),
				findFirst: () => ({
					sync: () => canvasRows[0] ?? null,
				}),
			},
		},
		insert: () => ({
			values: (value: typeof canvasDocuments.$inferInsert) => ({
				onConflictDoUpdate: () => ({
					run: () => {
						const index = canvasRows.findIndex((row) => row.id === value.id);
						const row = {
							createdAt: Date.now(),
							updatedAt: Date.now(),
							...value,
							projectId: value.projectId ?? null,
						} as typeof canvasDocuments.$inferSelect;
						if (index >= 0) canvasRows[index] = row;
						else canvasRows.push(row);
					},
				}),
			}),
		}),
		delete: () => ({
			where: () => ({
				run: () => {
					canvasRows.length = 0;
				},
			}),
		}),
	};
	const ctx = {
		db,
		isAuthenticated: true,
		organizationId: "org-1",
	} as unknown as HostServiceContext;
	return {
		root,
		worktreePath,
		terminalSessionRows,
		projectRows,
		caller: canvasRouter.createCaller(ctx),
		unauthorizedCaller: canvasRouter.createCaller({
			...ctx,
			isAuthenticated: false,
		}),
	};
}

describe("canvasRouter", () => {
	it("creates, patches, reads, exports, and imports workspace canvases", async () => {
		const { root, worktreePath, caller } = createCanvasTestContext();
		try {
			const created = await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Router Canvas",
			});
			expect(created.document.id).toBe("canvas-1");
			expect(existsSync(getCanvasDocumentPath(worktreePath, "canvas-1"))).toBe(
				true,
			);

			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "batch-1",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "node-1",
								type: "text",
								position: { x: 10, y: 20 },
								size: { width: 200, height: 120 },
								title: "Text",
								text: "Hello",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});

			const loaded = await caller.get({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(loaded.document.nodes).toHaveLength(1);
			expect(loaded.index?.revision).toBe(1);

			const history = await caller.getHistory({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(history.patches).toHaveLength(1);

			const undone = await caller.undo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(undone.document.nodes).toHaveLength(0);
			expect(undone.index.revision).toBe(2);
			expect(undone.batch.actor.id).toBe("host-service-undo");

			await expect(
				caller.undo({
					workspaceId: "workspace-1",
					canvasId: "canvas-1",
				}),
			).rejects.toThrow("Canvas has no persisted mutation history to undo");

			const redone = await caller.redo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(redone.document.nodes).toHaveLength(1);
			expect(redone.index.revision).toBe(3);
			expect(redone.batch.actor.id).toBe("host-service-redo");

			await expect(
				caller.redo({
					workspaceId: "workspace-1",
					canvasId: "canvas-1",
				}),
			).rejects.toThrow("Canvas has no persisted undo mutation to redo");

			const exported = await caller.exportJsonCanvas({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(exported.jsonCanvas.nodes).toHaveLength(1);

			const imported = await caller.importJsonCanvas({
				workspaceId: "workspace-1",
				canvasId: "canvas-2",
				title: "Imported",
				jsonCanvas: exported.jsonCanvas,
			});
			expect(imported.document.nodes).toHaveLength(1);
			expect(imported.report.importedNodes).toBe(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("supports multi-step persisted undo and redo from the patch log", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "History Canvas",
			});
			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "batch-node-1",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "node-1",
								type: "text",
								position: { x: 10, y: 20 },
								size: { width: 200, height: 120 },
								title: "One",
								text: "First",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});
			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "batch-node-2",
					canvasId: "canvas-1",
					baseVersion: 1,
					createdAt: "2026-06-17T00:01:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "node-2",
								type: "text",
								position: { x: 260, y: 20 },
								size: { width: 200, height: 120 },
								title: "Two",
								text: "Second",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});

			const firstUndo = await caller.undo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(firstUndo.document.nodes.map((node) => node.id)).toEqual([
				"node-1",
			]);
			expect(firstUndo.batch.history).toEqual({
				kind: "undo",
				targetBatchId: "batch-node-2",
			});

			const secondUndo = await caller.undo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(secondUndo.document.nodes).toHaveLength(0);
			expect(secondUndo.batch.history).toEqual({
				kind: "undo",
				targetBatchId: "batch-node-1",
			});

			const firstRedo = await caller.redo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(firstRedo.document.nodes.map((node) => node.id)).toEqual([
				"node-1",
			]);
			expect(firstRedo.batch.history).toEqual({
				kind: "redo",
				targetBatchId: "batch-node-1",
			});

			const secondRedo = await caller.redo({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
			});
			expect(secondRedo.document.nodes.map((node) => node.id)).toEqual([
				"node-1",
				"node-2",
			]);
			expect(secondRedo.batch.history).toEqual({
				kind: "redo",
				targetBatchId: "batch-node-2",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("streams watch events after persisted patches and supports unwatch ack", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-watch",
				title: "Watched Canvas",
			});

			const subscription = await caller.watch({
				workspaceId: "workspace-1",
				canvasId: "canvas-watch",
			});
			const iterator = subscription[Symbol.asyncIterator]();
			const nextEvent = expectCanvasWatchEvent(iterator.next());

			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "watch-batch-1",
					canvasId: "canvas-watch",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "watch-node-1",
								type: "text",
								position: { x: 10, y: 20 },
								size: { width: 200, height: 120 },
								title: "Watched node",
								text: "Watch me",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});

			const event = await nextEvent;
			expect(event).toMatchObject({
				type: "patch",
				workspaceId: "workspace-1",
				canvasId: "canvas-watch",
				revision: 1,
			});
			expect(event.index?.nodeCount).toBe(1);
			expect(typeof event.occurredAt).toBe("string");

			await iterator.return?.();

			await expect(
				caller.unwatch({
					workspaceId: "workspace-1",
					canvasId: "canvas-watch",
				}),
			).resolves.toEqual({
				success: true,
				workspaceId: "workspace-1",
				canvasId: "canvas-watch",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects unauthenticated access", async () => {
		const { root, unauthorizedCaller } = createCanvasTestContext();
		try {
			await expect(
				unauthorizedCaller.list({ workspaceId: "workspace-1" }),
			).rejects.toThrow("Invalid or missing authentication token");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("denies cross-workspace canvas access before mutating canonical storage", async () => {
		const { root, worktreePath, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Workspace 1 Canvas",
			});

			await expect(
				caller.patch({
					workspaceId: "workspace-2",
					batch: {
						id: "forbidden-batch",
						canvasId: "canvas-1",
						baseVersion: 0,
						createdAt: "2026-06-17T00:00:00.000Z",
						actor: { id: "test", type: "system" },
						mutations: [
							{
								type: "node.add",
								node: {
									id: "forbidden-node",
									type: "text",
									position: { x: 0, y: 0 },
									size: { width: 120, height: 80 },
									title: "Forbidden",
									text: "Should not persist",
									tags: [],
									locked: false,
									collapsed: false,
									metadata: {},
								},
							},
						],
					},
				}),
			).rejects.toThrow("Canvas does not belong to requested workspace");
			expect(readCanvasDocument(worktreePath, "canvas-1").nodes).toHaveLength(
				0,
			);

			await expect(
				caller.update({
					workspaceId: "workspace-2",
					canvasId: "canvas-1",
					patch: { title: "Forbidden title" },
				}),
			).rejects.toThrow("Canvas does not belong to requested workspace");
			expect(readCanvasDocument(worktreePath, "canvas-1").title).toBe(
				"Workspace 1 Canvas",
			);

			await expect(
				caller.snapshot({
					workspaceId: "workspace-2",
					canvasId: "canvas-1",
				}),
			).rejects.toThrow("Canvas does not belong to requested workspace");

			await expect(
				caller.getHistory({
					workspaceId: "workspace-2",
					canvasId: "canvas-1",
				}),
			).rejects.toThrow("Canvas does not belong to requested workspace");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects unsafe node refs in mutation batches before mutating canonical storage", async () => {
		const { root, worktreePath, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Scoped Ref Canvas",
			});

			await expect(
				caller.patch({
					workspaceId: "workspace-1",
					batch: {
						id: "unsafe-ref-batch",
						canvasId: "canvas-1",
						baseVersion: 0,
						createdAt: "2026-06-17T00:00:00.000Z",
						actor: { id: "test", type: "system" },
						mutations: [
							{
								type: "node.add",
								node: {
									id: "unsafe-file-node",
									type: "file",
									position: { x: 0, y: 0 },
									size: { width: 120, height: 80 },
									title: "Unsafe file",
									text: "Should not persist",
									tags: [],
									locked: false,
									collapsed: false,
									metadata: {},
									ref: {
										type: "file",
										id: "secret-file",
										path: "../secrets.env",
									},
								},
							},
						],
					},
				}),
			).rejects.toThrow("Canvas ref path is outside the workspace");

			expect(readCanvasDocument(worktreePath, "canvas-1").nodes).toHaveLength(
				0,
			);
			expect(readCanvasPatchBatches(worktreePath, "canvas-1")).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs safe read and export capabilities against persisted canvas data", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Capability Canvas",
			});
			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "capability-seed",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "note-node",
								type: "note",
								position: { x: 10, y: 20 },
								size: { width: 200, height: 120 },
								title: "Alpha note",
								text: "Searchable alpha content",
								tags: ["topic"],
								locked: false,
								collapsed: false,
								metadata: {},
								ref: { type: "note", id: "note-1" },
							},
						},
						{
							type: "node.add",
							node: {
								id: "session-node",
								type: "chat-session",
								position: { x: 260, y: 20 },
								size: { width: 200, height: 120 },
								title: "Session",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
								ref: { type: "session", id: "session-1" },
							},
						},
						{
							type: "node.add",
							node: {
								id: "artifact-node",
								type: "artifact",
								position: { x: 520, y: 220 },
								size: { width: 180, height: 100 },
								title: "Artifact",
								text: "Generated artifact",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
								ref: { type: "artifact", id: "artifact-1" },
							},
						},
						{
							type: "edge.add",
							edge: {
								id: "edge-note-session",
								from: { nodeId: "note-node", side: "right" },
								to: { nodeId: "session-node", side: "left" },
								label: "continues in",
								directed: true,
								metadata: {},
							},
						},
					],
				},
			});

			const exported = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.exportJsonCanvas",
			});
			expect(
				"jsonCanvas" in exported ? exported.jsonCanvas.nodes : [],
			).toHaveLength(3);

			const zoomToFit = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.zoomToFit",
			});
			if (!("viewport" in zoomToFit)) {
				throw new Error("zoomToFit returned no viewport");
			}
			expect(zoomToFit.viewport.bounds).toEqual({
				x: 10,
				y: 20,
				width: 690,
				height: 300,
			});

			const zoomToSelection = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.zoomToSelection",
				selection: { edgeIds: ["edge-note-session"] },
			});
			if (!("viewport" in zoomToSelection)) {
				throw new Error("zoomToSelection returned no viewport");
			}
			expect(zoomToSelection.viewport.nodeIds).toEqual([
				"note-node",
				"session-node",
			]);

			const focused = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.focusNode",
				selection: { nodeIds: ["note-node"] },
			});
			if (!("center" in focused))
				throw new Error("focusNode returned no center");
			expect(focused.center).toEqual({ x: 110, y: 80 });

			const linkedNote = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.openLinkedNote",
				selection: { nodeIds: ["note-node"] },
			});
			expect("ref" in linkedNote ? linkedNote.ref.type : null).toBe("note");

			const linkedSession = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.openLinkedSession",
				selection: { nodeIds: ["session-node"] },
			});
			expect("ref" in linkedSession ? linkedSession.ref.id : null).toBe(
				"session-1",
			);

			const linkedArtifact = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.openLinkedArtifact",
				selection: { nodeIds: ["artifact-node"] },
			});
			expect("ref" in linkedArtifact ? linkedArtifact.ref.id : null).toBe(
				"artifact-1",
			);

			const markdown = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.exportMarkdownMap",
			});
			expect("markdown" in markdown ? markdown.markdown : "").toContain(
				"Alpha note",
			);

			const textSearch = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.searchText",
				query: "alpha",
			});
			expect("nodes" in textSearch ? textSearch.nodes : []).toHaveLength(1);

			const typeFilter = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.filterByType",
				nodeType: "note",
			});
			expect("nodes" in typeFilter ? typeFilter.nodes : []).toHaveLength(1);

			const backlinks = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.showBacklinks",
				selection: { nodeIds: ["note-node"] },
			});
			expect("edges" in backlinks ? backlinks.edges : []).toHaveLength(1);

			const bundle = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.exportBundle",
			});
			expect("patches" in bundle ? bundle.patches : []).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs selection-aware write capabilities as persisted CanvasMutation batches", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Write Capability Canvas",
			});
			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "write-capability-seed",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "left-node",
								type: "text",
								position: { x: 0, y: 0 },
								size: { width: 120, height: 80 },
								title: "Left",
								text: "Left",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
						{
							type: "node.add",
							node: {
								id: "middle-node",
								type: "text",
								position: { x: 180, y: 40 },
								size: { width: 120, height: 80 },
								title: "Middle",
								text: "Middle",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
						{
							type: "node.add",
							node: {
								id: "right-node",
								type: "text",
								position: { x: 420, y: 80 },
								size: { width: 120, height: 80 },
								title: "Right",
								text: "Right",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});

			const aligned = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.alignLeft",
				selection: { nodeIds: ["middle-node", "right-node"] },
			});
			if (!("batch" in aligned)) throw new Error("alignLeft returned no batch");
			expect(aligned.batch.mutations).toEqual([
				{
					type: "node.update",
					nodeId: "right-node",
					patch: { position: { x: 180, y: 80 } },
				},
			]);
			expect(
				aligned.document.nodes.find((node) => node.id === "right-node")
					?.position.x,
			).toBe(180);

			const grouped = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.groupSelection",
				selection: {
					nodeIds: ["left-node", "middle-node", "right-node"],
				},
			});
			if (!("batch" in grouped)) {
				throw new Error("groupSelection returned no batch");
			}
			const groupMutation = grouped.batch.mutations[0];
			expect(groupMutation?.type).toBe("group.add");
			expect(grouped.document.groups).toHaveLength(1);
			expect(grouped.document.groups[0]?.nodeIds).toEqual([
				"left-node",
				"middle-node",
				"right-node",
			]);

			const linked = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.linkSelectedNodes",
				selection: {
					nodeIds: ["left-node", "middle-node", "right-node"],
				},
			});
			if (!("batch" in linked)) {
				throw new Error("linkSelectedNodes returned no batch");
			}
			expect(linked.batch.mutations.map((mutation) => mutation.type)).toEqual([
				"edge.add",
				"edge.add",
			]);
			expect(linked.document.edges.map((edge) => edge.from.nodeId)).toEqual([
				"left-node",
				"middle-node",
			]);
			expect(linked.document.edges.map((edge) => edge.to.nodeId)).toEqual([
				"middle-node",
				"right-node",
			]);

			const colored = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.colorSelection",
				color: { key: "accent", value: "#ffcc00" },
				selection: {
					nodeIds: ["left-node"],
					edgeIds: [linked.document.edges[0]?.id ?? ""],
					groupIds: [grouped.document.groups[0]?.id ?? ""],
				},
			});
			if (!("batch" in colored)) {
				throw new Error("colorSelection returned no batch");
			}
			expect(colored.batch.mutations.map((mutation) => mutation.type)).toEqual([
				"node.update",
				"edge.update",
				"group.update",
			]);
			expect(
				colored.document.nodes.find((node) => node.id === "left-node")?.color,
			).toEqual({ key: "accent", value: "#ffcc00" });

			const tagged = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.tagSelection",
				tags: ["review"],
				selection: { nodeIds: ["left-node", "middle-node"] },
			});
			if (!("batch" in tagged)) {
				throw new Error("tagSelection returned no batch");
			}
			expect(tagged.batch.mutations).toHaveLength(2);
			expect(
				tagged.document.nodes.find((node) => node.id === "left-node")?.tags,
			).toContain("review");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects stale color selections before mutating canonical storage", async () => {
		const { root, worktreePath, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Stale Selection Canvas",
			});
			await caller.patch({
				workspaceId: "workspace-1",
				batch: {
					id: "stale-selection-seed",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [
						{
							type: "node.add",
							node: {
								id: "existing-node",
								type: "text",
								position: { x: 0, y: 0 },
								size: { width: 120, height: 80 },
								title: "Existing",
								text: "Existing",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
							},
						},
					],
				},
			});

			await expect(
				caller.runCapability({
					workspaceId: "workspace-1",
					canvasId: "canvas-1",
					capabilityId: "canvas.colorSelection",
					color: { key: "danger", value: "#ff0000" },
					selection: {
						nodeIds: ["existing-node", "missing-node"],
					},
				}),
			).rejects.toThrow(
				"canvas.colorSelection selected missing node: missing-node",
			);

			const document = readCanvasDocument(worktreePath, "canvas-1");
			expect(document.nodes[0]?.color).toBeUndefined();
			expect(readCanvasPatchBatches(worktreePath, "canvas-1")).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs local import and capture capabilities as persisted CanvasMutation batches", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Import Capability Canvas",
			});

			const markdownImport = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.importMarkdownAsNodes",
				markdown: "# Plan\n\nShip the Canvas workspace.",
			});
			if (!("batch" in markdownImport)) {
				throw new Error("importMarkdownAsNodes returned no batch");
			}
			expect(markdownImport.batch.mutations).toHaveLength(2);
			expect(markdownImport.document.nodes.map((node) => node.type)).toEqual([
				"text",
				"text",
			]);

			const capturedUrl = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.captureUrl",
				url: "https://example.com/research",
				title: "Research URL",
			});
			const capturedUrlDocument =
				"document" in capturedUrl ? capturedUrl.document : undefined;
			if (!capturedUrlDocument) {
				throw new Error("captureUrl returned no document");
			}
			expect(capturedUrlDocument.nodes.at(-1)?.ref).toEqual({
				type: "url",
				id: "https://example.com/research",
				url: "https://example.com/research",
			});

			const capturedSession = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.captureSession",
				sessionId: "session-42",
				title: "Session 42",
			});
			const capturedSessionDocument =
				"document" in capturedSession ? capturedSession.document : undefined;
			if (!capturedSessionDocument) {
				throw new Error("captureSession returned no document");
			}
			expect(capturedSessionDocument.nodes.at(-1)?.ref).toEqual({
				type: "session",
				id: "session-42",
			});

			const clipboard = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.captureClipboard",
				text: "Clipboard text",
				title: "Clipboard note",
			});
			const clipboardDocument =
				"document" in clipboard ? clipboard.document : undefined;
			if (!clipboardDocument) {
				throw new Error("captureClipboard returned no document");
			}
			expect(clipboardDocument.nodes.at(-1)?.type).toBe("text");
			expect(clipboardDocument.nodes.at(-1)?.text).toBe("Clipboard text");

			const jsonImport = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.importJsonCanvas",
				jsonCanvas: {
					nodes: [
						{
							id: "json-node",
							type: "text",
							x: 0,
							y: 0,
							width: 200,
							height: 120,
							text: "Imported JSON Canvas text",
						},
					],
					edges: [],
				},
			});
			const jsonImportReport =
				"report" in jsonImport ? jsonImport.report : undefined;
			const jsonImportDocument =
				"document" in jsonImport ? jsonImport.document : undefined;
			if (!jsonImportReport || !jsonImportDocument) {
				throw new Error("importJsonCanvas capability returned no report");
			}
			expect(jsonImportReport.importedNodes).toBe(1);
			expect(
				jsonImportDocument.nodes.some((node) => node.id === "json-node"),
			).toBe(true);

			await expect(
				caller.runCapability({
					workspaceId: "workspace-1",
					canvasId: "canvas-1",
					capabilityId: "canvas.captureFile",
					path: "../secrets.env",
				}),
			).rejects.toThrow("Canvas ref path is outside the workspace");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("returns honest unavailable results for registered source-gated capabilities", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Unavailable Capability Canvas",
			});

			const unavailable = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.runAgentOnSelection",
				selection: { nodeIds: ["missing-node"] },
			});
			expect("status" in unavailable ? unavailable.status : null).toBe(
				"unavailable",
			);
			expect("risks" in unavailable ? unavailable.risks : []).toContain(
				"agent",
			);
			expect(
				"requiresSelection" in unavailable
					? unavailable.requiresSelection
					: false,
			).toBe(true);

			const importBundle = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.importBundle",
			});
			expect("status" in importBundle ? importBundle.status : null).toBe(
				"unavailable",
			);
			expect("risks" in importBundle ? importBundle.risks : []).toContain(
				"import",
			);

			await expect(
				caller.runCapability({
					workspaceId: "workspace-1",
					canvasId: "canvas-1",
					capabilityId: "canvas.unknownCapability",
				}),
			).rejects.toThrow("Canvas capability is registered but not executable");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("rejects unsafe or cross-workspace node ref resolution", async () => {
		const { root, caller } = createCanvasTestContext();
		try {
			await expect(
				caller.resolveNodeRef({
					workspaceId: "workspace-1",
					ref: {
						type: "file",
						id: "file-1",
						workspaceId: "workspace-2",
						path: "notes/other.md",
					},
				}),
			).rejects.toThrow("Canvas ref does not belong to requested workspace");

			await expect(
				caller.resolveNodeRef({
					workspaceId: "workspace-1",
					ref: {
						type: "file",
						id: "file-1",
						path: "../secrets.env",
					},
				}),
			).rejects.toThrow("Canvas ref path is outside the workspace");

			await expect(
				caller.resolveNodeRef({
					workspaceId: "workspace-1",
					ref: {
						type: "url",
						id: "url-1",
						url: "file:///etc/passwd",
					},
				}),
			).rejects.toThrow("Canvas ref URL protocol is not supported");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("routes agent-backed capabilities to the agent runtime, with a guarded fallback", async () => {
		const { root, worktreePath, caller } = createCanvasTestContext();
		try {
			await caller.create({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				title: "Agent Canvas",
			});

			// No agent runtime on the default test context -> guarded fallback.
			const unavailable = await caller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.summarizeSelection",
			});
			expect("status" in unavailable ? unavailable.status : null).toBe(
				"unavailable",
			);
			expect("reason" in unavailable ? unavailable.reason : "").toContain(
				"agent runtime",
			);

			// With a wired runtime, the capability routes through runAgentInWorkspace.
			let capturedPrompt = "";
			const runtimeCaller = canvasRouter.createCaller({
				db: {
					query: {
						workspaces: {
							findFirst: () => ({
								sync: () => ({
									id: "workspace-1",
									projectId: "project-1",
									worktreePath,
								}),
							}),
						},
						canvasDocuments: {
							findFirst: () => ({ sync: () => null }),
							findMany: () => ({ sync: () => [] }),
						},
					},
					insert: () => ({
						values: () => ({ onConflictDoUpdate: () => ({ run: () => {} }) }),
					}),
				},
				isAuthenticated: true,
				organizationId: "org-1",
				api: {
					chat: { createSession: { mutate: async () => undefined } },
				},
				runtime: {
					chat: {
						sendMessage: async (args: { payload: { content: string } }) => {
							capturedPrompt = args.payload.content;
						},
					},
				},
			} as unknown as HostServiceContext);

			const started = await runtimeCaller.runCapability({
				workspaceId: "workspace-1",
				canvasId: "canvas-1",
				capabilityId: "canvas.summarizeSelection",
			});
			expect("status" in started ? started.status : null).toBe("started");
			expect("run" in started && started.run ? started.run.kind : null).toBe(
				"chat",
			);
			expect(capturedPrompt).toContain("Summarize the selected canvas nodes");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("resolves file, session, project, url refs and falls back for unbacked types", async () => {
		const { root, worktreePath, terminalSessionRows, caller } =
			createCanvasTestContext();
		try {
			// File ref -> real file inside the workspace worktree.
			mkdirSync(join(worktreePath, "notes"), { recursive: true });
			writeFileSync(join(worktreePath, "notes", "plan.md"), "# Plan\nhello");
			const fileResolution = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "file", id: "file-1", path: "notes/plan.md" },
			});
			expect(fileResolution.resolved).toBe(true);
			expect(fileResolution.source).toBe("file");
			expect(fileResolution.preview).toContain("# Plan");

			// Missing file -> resolved false (not a thrown error).
			const missingFile = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "file", id: "file-2", path: "notes/missing.md" },
			});
			expect(missingFile.resolved).toBe(false);
			expect(missingFile.reason).toBe("file-not-found");

			// Session ref -> real terminal_sessions row, workspace-scoped.
			terminalSessionRows.push({
				id: "session-1",
				originWorkspaceId: "workspace-1",
				status: "active",
				createdAt: 1,
				lastAttachedAt: null,
				endedAt: null,
			});
			const sessionResolution = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "session", id: "session-1" },
			});
			expect(sessionResolution.resolved).toBe(true);
			expect(sessionResolution.source).toBe("session");
			expect(sessionResolution.entity?.status).toBe("active");

			// Cross-workspace session ref -> forbidden.
			terminalSessionRows[0] = {
				id: "session-1",
				originWorkspaceId: "workspace-2",
				status: "active",
				createdAt: 1,
				lastAttachedAt: null,
				endedAt: null,
			};
			await expect(
				caller.resolveNodeRef({
					workspaceId: "workspace-1",
					ref: { type: "session", id: "session-1" },
				}),
			).rejects.toThrow("Canvas session ref belongs to another workspace");

			// Project ref -> real host-service project row.
			const projectResolution = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "project", id: "project-1" },
			});
			expect(projectResolution.resolved).toBe(true);
			expect(projectResolution.source).toBe("project");

			// URL ref -> validated external reference (no fetch).
			const urlResolution = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "url", id: "url-1", url: "https://example.com/doc" },
			});
			expect(urlResolution.resolved).toBe(true);
			expect(urlResolution.source).toBe("url");

			// Unbacked ref type -> typed fallback, not a fabricated preview.
			const artifactResolution = await caller.resolveNodeRef({
				workspaceId: "workspace-1",
				ref: { type: "artifact", id: "artifact-1" },
			});
			expect(artifactResolution.resolved).toBe(false);
			expect(artifactResolution.source).toBe("unsupported");
			expect(artifactResolution.reason).toBe("unsupported-ref-type:artifact");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
