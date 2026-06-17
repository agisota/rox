import { randomUUID } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import {
	applyCanvasMutationBatch,
	type CanvasDocument,
	type CanvasMutationBatch,
	type CanvasNodeRef,
	canvasDocumentSchema,
	canvasMutationBatchSchema,
} from "@rox/shared/canvas";

export const CANVAS_STORAGE_DIR = ".rox/canvases";
const CANVAS_WRITE_LOCK_TIMEOUT_MS = 5000;
const CANVAS_WRITE_LOCK_POLL_MS = 10;

export interface CanvasStorageWorkspace {
	id: string;
	projectId: string;
	worktreePath: string;
}

export interface CanvasIndexSummary {
	id: string;
	workspaceId: string;
	projectId?: string;
	title: string;
	revision: number;
	path: string;
	nodeCount: number;
	edgeCount: number;
	groupCount: number;
	nodeTypes: Record<string, number>;
	refs: Array<CanvasNodeRef & { nodeId: string }>;
	createdAt: number;
	updatedAt: number;
}

function assertSafeCanvasId(canvasId: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(canvasId)) {
		throw new Error(`Unsafe canvas id: ${canvasId}`);
	}
}

function assertInside(parent: string, child: string): void {
	const parentResolved = resolve(parent);
	const childResolved = resolve(child);
	if (
		childResolved !== parentResolved &&
		!childResolved.startsWith(`${parentResolved}/`)
	) {
		throw new Error(`Canvas path escapes workspace: ${child}`);
	}
}

export function getCanvasRoot(worktreePath: string): string {
	return join(worktreePath, CANVAS_STORAGE_DIR);
}

export function getCanvasDir(worktreePath: string, canvasId: string): string {
	assertSafeCanvasId(canvasId);
	const root = getCanvasRoot(worktreePath);
	const dir = normalize(join(root, canvasId));
	assertInside(root, dir);
	return dir;
}

export function getCanvasDocumentPath(
	worktreePath: string,
	canvasId: string,
): string {
	return join(getCanvasDir(worktreePath, canvasId), "canvas.json");
}

function getCanvasBaseDocumentPath(
	worktreePath: string,
	canvasId: string,
): string {
	return join(getCanvasDir(worktreePath, canvasId), "base.json");
}

function getCanvasPatchLogPath(worktreePath: string, canvasId: string): string {
	return join(getCanvasDir(worktreePath, canvasId), "patches.jsonl");
}

function getCanvasWriteLockPath(
	worktreePath: string,
	canvasId: string,
): string {
	return join(getCanvasDir(worktreePath, canvasId), ".write.lock");
}

function getCanvasSnapshotsDir(worktreePath: string, canvasId: string): string {
	return join(getCanvasDir(worktreePath, canvasId), "snapshots");
}

function sleepSync(ms: number): void {
	const view = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(view, 0, 0, ms);
}

function withCanvasWriteLock<T>(
	worktreePath: string,
	canvasId: string,
	fn: () => T,
): T {
	const canvasDir = getCanvasDir(worktreePath, canvasId);
	mkdirSync(canvasDir, { recursive: true, mode: 0o700 });
	const lockPath = getCanvasWriteLockPath(worktreePath, canvasId);
	const startedAt = Date.now();
	for (;;) {
		try {
			mkdirSync(lockPath, { mode: 0o700 });
			break;
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!("code" in error) ||
				error.code !== "EEXIST"
			) {
				throw error;
			}
			if (Date.now() - startedAt >= CANVAS_WRITE_LOCK_TIMEOUT_MS) {
				throw new Error(`Timed out waiting for Canvas write lock: ${canvasId}`);
			}
			sleepSync(CANVAS_WRITE_LOCK_POLL_MS);
		}
	}
	try {
		return fn();
	} finally {
		rmSync(lockPath, { recursive: true, force: true });
	}
}

function writeJsonAtomic(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const tmpPath = `${path}.${randomUUID()}.tmp`;
	writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 0o600,
	});
	renameSync(tmpPath, path);
}

export function createCanvasDocument(args: {
	workspace: CanvasStorageWorkspace;
	canvasId?: string;
	title?: string;
	description?: string;
}): CanvasDocument {
	const now = new Date().toISOString();
	const document = canvasDocumentSchema.parse({
		version: 1,
		id: args.canvasId ?? randomUUID(),
		workspaceId: args.workspace.id,
		projectId: args.workspace.projectId,
		title: args.title ?? "Untitled Canvas",
		description: args.description,
		nodes: [],
		edges: [],
		groups: [],
		tags: [],
		createdAt: now,
		updatedAt: now,
		metadata: {},
	});
	initializeCanvasDocument(args.workspace.worktreePath, document);
	return document;
}

export function initializeCanvasDocument(
	worktreePath: string,
	document: CanvasDocument,
): CanvasDocument {
	const parsed = canvasDocumentSchema.parse(document);
	const dir = getCanvasDir(worktreePath, parsed.id);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeJsonAtomic(getCanvasBaseDocumentPath(worktreePath, parsed.id), parsed);
	writeJsonAtomic(getCanvasDocumentPath(worktreePath, parsed.id), parsed);
	return parsed;
}

export function readCanvasDocument(
	worktreePath: string,
	canvasId: string,
): CanvasDocument {
	const path = getCanvasDocumentPath(worktreePath, canvasId);
	return canvasDocumentSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function writeCanvasDocument(
	worktreePath: string,
	document: CanvasDocument,
): CanvasDocument {
	const parsed = canvasDocumentSchema.parse(document);
	writeJsonAtomic(getCanvasDocumentPath(worktreePath, parsed.id), parsed);
	return parsed;
}

export function deleteCanvasDocument(
	worktreePath: string,
	canvasId: string,
): void {
	rmSync(getCanvasDir(worktreePath, canvasId), {
		recursive: true,
		force: true,
	});
}

export function listCanvasDocumentIds(worktreePath: string): string[] {
	const root = getCanvasRoot(worktreePath);
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name))
		.sort((a, b) => a.localeCompare(b));
}

export function readCanvasPatchBatches(
	worktreePath: string,
	canvasId: string,
): CanvasMutationBatch[] {
	const path = getCanvasPatchLogPath(worktreePath, canvasId);
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => canvasMutationBatchSchema.parse(JSON.parse(line)));
}

export function readCanvasDocumentAtRevision(
	worktreePath: string,
	canvasId: string,
	revision: number,
): CanvasDocument {
	if (!Number.isInteger(revision) || revision < 0) {
		throw new Error(`Invalid canvas revision: ${revision}`);
	}
	const base = canvasDocumentSchema.parse(
		JSON.parse(
			readFileSync(getCanvasBaseDocumentPath(worktreePath, canvasId), "utf8"),
		),
	);
	const batches = readCanvasPatchBatches(worktreePath, canvasId);
	if (revision > batches.length) {
		throw new Error(
			`Canvas revision ${revision} is ahead of patch log length ${batches.length}`,
		);
	}
	return batches.slice(0, revision).reduce(
		(document, batch) =>
			canvasDocumentSchema.parse({
				...applyCanvasMutationBatch(document, batch),
				updatedAt: batch.createdAt,
			}),
		base,
	);
}

export function appendCanvasPatchBatch(
	worktreePath: string,
	batch: CanvasMutationBatch,
): void {
	canvasMutationBatchSchema.parse(batch);
	const dir = getCanvasDir(worktreePath, batch.canvasId);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	appendFileSync(
		getCanvasPatchLogPath(worktreePath, batch.canvasId),
		`${JSON.stringify(batch)}\n`,
		{ mode: 0o600 },
	);
}

export function applyAndPersistCanvasMutationBatch(args: {
	worktreePath: string;
	batch: CanvasMutationBatch;
}): { document: CanvasDocument; revision: number } {
	return withCanvasWriteLock(
		args.worktreePath,
		args.batch.canvasId,
		(): { document: CanvasDocument; revision: number } => {
			const current = readCanvasDocument(
				args.worktreePath,
				args.batch.canvasId,
			);
			const batches = readCanvasPatchBatches(
				args.worktreePath,
				args.batch.canvasId,
			);
			if (args.batch.baseVersion !== batches.length) {
				throw new Error(
					`Canvas baseVersion mismatch: expected ${batches.length}, got ${args.batch.baseVersion}`,
				);
			}
			const updated = canvasDocumentSchema.parse({
				...applyCanvasMutationBatch(current, args.batch),
				updatedAt: args.batch.createdAt,
			});
			appendCanvasPatchBatch(args.worktreePath, args.batch);
			writeCanvasDocument(args.worktreePath, updated);
			return { document: updated, revision: batches.length + 1 };
		},
	);
}

export function replayCanvasDocument(
	worktreePath: string,
	canvasId: string,
): CanvasDocument {
	const base = canvasDocumentSchema.parse(
		JSON.parse(
			readFileSync(getCanvasBaseDocumentPath(worktreePath, canvasId), "utf8"),
		),
	);
	const replayed = readCanvasPatchBatches(worktreePath, canvasId).reduce(
		(document, batch) =>
			canvasDocumentSchema.parse({
				...applyCanvasMutationBatch(document, batch),
				updatedAt: batch.createdAt,
			}),
		base,
	);
	return replayed;
}

export function createCanvasSnapshot(args: {
	worktreePath: string;
	canvasId: string;
	label?: string;
}): { snapshotId: string; path: string; createdAt: string } {
	const createdAt = new Date().toISOString();
	const snapshotId = `${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}`;
	const document = readCanvasDocument(args.worktreePath, args.canvasId);
	const snapshotsDir = getCanvasSnapshotsDir(args.worktreePath, args.canvasId);
	mkdirSync(snapshotsDir, { recursive: true, mode: 0o700 });
	const path = join(snapshotsDir, `${snapshotId}.json`);
	writeJsonAtomic(path, {
		snapshotId,
		label: args.label,
		createdAt,
		document,
	});
	return { snapshotId, path, createdAt };
}

export function restoreCanvasSnapshot(args: {
	worktreePath: string;
	canvasId: string;
	snapshotId: string;
}): CanvasDocument {
	assertSafeCanvasId(args.snapshotId.replace(/\.json$/, ""));
	const snapshotsDir = getCanvasSnapshotsDir(args.worktreePath, args.canvasId);
	const path = join(
		snapshotsDir,
		`${args.snapshotId.replace(/\.json$/, "")}.json`,
	);
	assertInside(snapshotsDir, path);
	const payload = JSON.parse(readFileSync(path, "utf8")) as {
		document: unknown;
	};
	const document = canvasDocumentSchema.parse(payload.document);
	writeCanvasDocument(args.worktreePath, document);
	return document;
}

export function listCanvasSnapshots(
	worktreePath: string,
	canvasId: string,
): Array<{ snapshotId: string; path: string }> {
	const dir = getCanvasSnapshotsDir(worktreePath, canvasId);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.map((entry) => ({
			snapshotId: entry.name.replace(/\.json$/, ""),
			path: join(dir, entry.name),
		}))
		.sort((a, b) => b.snapshotId.localeCompare(a.snapshotId));
}

export function summarizeCanvasDocument(
	worktreePath: string,
	document: CanvasDocument,
	revision: number,
): CanvasIndexSummary {
	const nodeTypes: Record<string, number> = {};
	const refs: Array<CanvasNodeRef & { nodeId: string }> = [];
	for (const node of document.nodes) {
		nodeTypes[node.type] = (nodeTypes[node.type] ?? 0) + 1;
		if (node.ref) refs.push({ ...node.ref, nodeId: node.id });
	}
	return {
		id: document.id,
		workspaceId: document.workspaceId,
		projectId: document.projectId,
		title: document.title,
		revision,
		path: getCanvasDocumentPath(worktreePath, document.id),
		nodeCount: document.nodes.length,
		edgeCount: document.edges.length,
		groupCount: document.groups.length,
		nodeTypes,
		refs,
		createdAt: Date.parse(document.createdAt),
		updatedAt: Date.parse(document.updatedAt),
	};
}
