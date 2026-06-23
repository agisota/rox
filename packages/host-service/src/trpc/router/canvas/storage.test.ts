import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyAndPersistCanvasMutationBatch,
	createCanvasDocument,
	createCanvasSnapshot,
	getCanvasDocumentPath,
	listCanvasSnapshots,
	readCanvasDocument,
	readCanvasDocumentAtRevision,
	replayCanvasDocument,
	restoreCanvasSnapshot,
	summarizeCanvasDocument,
} from "./storage";

function withTempWorkspace<T>(fn: (worktreePath: string) => T): T {
	const worktreePath = mkdtempSync(join(tmpdir(), "rox-canvas-storage-"));
	try {
		return fn(worktreePath);
	} finally {
		rmSync(worktreePath, { recursive: true, force: true });
	}
}

describe("canvas storage", () => {
	it("creates canonical canvas.json and index summary", () =>
		withTempWorkspace((worktreePath) => {
			const document = createCanvasDocument({
				workspace: {
					id: "workspace-1",
					projectId: "project-1",
					worktreePath,
				},
				canvasId: "canvas-1",
				title: "Research map",
			});

			expect(readCanvasDocument(worktreePath, "canvas-1").title).toBe(
				"Research map",
			);
			expect(getCanvasDocumentPath(worktreePath, "canvas-1")).toEndWith(
				".rox/canvases/canvas-1/canvas.json",
			);

			const summary = summarizeCanvasDocument(worktreePath, document, 0);
			expect(summary.nodeCount).toBe(0);
			expect(summary.refs).toEqual([]);
		}));

	it("applies mutation batches and replays patches from base document", () =>
		withTempWorkspace((worktreePath) => {
			createCanvasDocument({
				workspace: {
					id: "workspace-1",
					projectId: "project-1",
					worktreePath,
				},
				canvasId: "canvas-1",
			});

			const result = applyAndPersistCanvasMutationBatch({
				worktreePath,
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
								type: "note",
								position: { x: 10, y: 20 },
								size: { width: 200, height: 120 },
								title: "Note",
								tags: [],
								locked: false,
								collapsed: false,
								metadata: {},
								ref: { type: "note", id: "note-1" },
							},
						},
					],
				},
			});

			expect(result.revision).toBe(1);
			expect(result.document.nodes).toHaveLength(1);
			expect(
				readCanvasDocumentAtRevision(worktreePath, "canvas-1", 0).nodes,
			).toHaveLength(0);
			expect(readCanvasDocumentAtRevision(worktreePath, "canvas-1", 1)).toEqual(
				result.document,
			);
			expect(replayCanvasDocument(worktreePath, "canvas-1")).toEqual(
				result.document,
			);
		}));

	it("waits for the per-canvas write lock before appending patches", async () => {
		const worktreePath = mkdtempSync(join(tmpdir(), "rox-canvas-storage-"));
		try {
			createCanvasDocument({
				workspace: {
					id: "workspace-1",
					projectId: "project-1",
					worktreePath,
				},
				canvasId: "canvas-lock",
			});
			const lockDir = join(
				worktreePath,
				".rox",
				"canvases",
				"canvas-lock",
				".write.lock",
			);
			mkdirSync(lockDir, { recursive: true });
			const unlocker = Bun.spawn([
				process.execPath,
				"-e",
				`setTimeout(() => require("node:fs").rmSync(${JSON.stringify(lockDir)}, { recursive: true, force: true }), 50);`,
			]);
			const startedAt = Date.now();

			const result = applyAndPersistCanvasMutationBatch({
				worktreePath,
				batch: {
					id: "batch-lock",
					canvasId: "canvas-lock",
					baseVersion: 0,
					createdAt: "2026-06-17T00:00:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [{ type: "document.update", patch: { title: "Locked" } }],
				},
			});

			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
			expect(result.revision).toBe(1);
			expect(replayCanvasDocument(worktreePath, "canvas-lock")).toEqual(
				result.document,
			);
			await unlocker.exited;
		} finally {
			rmSync(worktreePath, { recursive: true, force: true });
		}
	});

	it("creates and restores snapshots", () =>
		withTempWorkspace((worktreePath) => {
			createCanvasDocument({
				workspace: {
					id: "workspace-1",
					projectId: "project-1",
					worktreePath,
				},
				canvasId: "canvas-1",
				title: "Before",
			});

			const snapshot = createCanvasSnapshot({
				worktreePath,
				canvasId: "canvas-1",
			});
			applyAndPersistCanvasMutationBatch({
				worktreePath,
				batch: {
					id: "batch-1",
					canvasId: "canvas-1",
					baseVersion: 0,
					createdAt: "2026-06-17T00:01:00.000Z",
					actor: { id: "test", type: "system" },
					mutations: [{ type: "document.update", patch: { title: "After" } }],
				},
			});

			expect(readCanvasDocument(worktreePath, "canvas-1").title).toBe("After");
			expect(listCanvasSnapshots(worktreePath, "canvas-1")).toHaveLength(1);
			restoreCanvasSnapshot({
				worktreePath,
				canvasId: "canvas-1",
				snapshotId: snapshot.snapshotId,
			});
			expect(readCanvasDocument(worktreePath, "canvas-1").title).toBe("Before");
		}));
});
