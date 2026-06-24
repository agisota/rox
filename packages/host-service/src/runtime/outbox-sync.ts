import { and, asc, eq, lte } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, syncOutbox, workspaces } from "../db/schema";
import { logger } from "../lib/logger";
import {
	type CloudCreateContext,
	createCloudMainWorkspace,
	createCloudProjectWithSlugRetry,
	isProjectIdAlreadyInUse,
} from "../trpc/router/project/utils/cloud-create";
import type {
	ProjectCreatePayload,
	WorkspaceCreatePayload,
} from "../trpc/router/project/utils/outbox";

export interface OutboxSyncContext extends CloudCreateContext {
	db: HostDb;
}

export interface OutboxSyncOptions {
	/** Poll interval in ms (default 15s). The interval IS the connectivity probe. */
	intervalMs?: number;
	/** Max attempts before a row is parked (kept, but no longer auto-retried). */
	maxAttempts?: number;
}

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 50;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

type OutboxRow = typeof syncOutbox.$inferSelect;

/** Capped exponential backoff for the Nth attempt (1-based). */
export function backoffMs(attempts: number): number {
	const exp = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
	return Math.min(exp, MAX_BACKOFF_MS);
}

/**
 * Drains the local-first `sync_outbox`, issuing the deferred cloud creates
 * (`v2Project.create` / `v2Workspace.create`) when the cloud is reachable and
 * linking the returned cloud id back onto the local row. Mirrors the
 * start/stop lifecycle of `PullRequestRuntimeManager` and the periodic
 * reconcile of `runMainWorkspaceSweep`.
 *
 * Idempotent: each row is keyed by the LOCAL entity id; before a cloud call the
 * worker re-reads the local row and skips if already `synced`; a primary-key
 * collision in the cloud (our id already created by a prior, crash-truncated
 * drain) is treated as success. So a retry never double-creates.
 */
export class OutboxSyncManager {
	private readonly ctx: OutboxSyncContext;
	private readonly intervalMs: number;
	private readonly maxAttempts: number;
	private timer: ReturnType<typeof setInterval> | null = null;
	private draining = false;
	private stopped = false;

	constructor(ctx: OutboxSyncContext, options: OutboxSyncOptions = {}) {
		this.ctx = ctx;
		this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
		this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	}

	start(): void {
		if (this.timer) return;
		this.stopped = false;
		// Immediate drain so a reachable cloud links fast, then poll.
		void this.drainOnce();
		this.timer = setInterval(() => {
			void this.drainOnce();
		}, this.intervalMs);
		// Don't keep the event loop alive solely for this poller.
		this.timer.unref?.();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Process every currently-eligible row once. Never throws — a cloud failure
	 * reschedules the row with backoff and is logged, exactly like the other
	 * fire-and-forget host runtimes. Returns the number of rows that synced.
	 */
	async drainOnce(): Promise<number> {
		if (this.draining || this.stopped) return 0;
		this.draining = true;
		let synced = 0;
		try {
			const now = Date.now();
			// Project rows before workspace rows: a workspace can't be created in
			// the cloud until its project exists. `asc(kind)` puts
			// 'project.create' before 'workspace.create' alphabetically.
			const rows = this.ctx.db
				.select()
				.from(syncOutbox)
				.where(lte(syncOutbox.nextAttemptAt, now))
				.orderBy(asc(syncOutbox.kind), asc(syncOutbox.createdAt))
				.all();

			for (const row of rows) {
				if (this.stopped) break;
				const ok = await this.processRow(row);
				if (ok) synced++;
			}
		} catch (err) {
			// Defensive: the loop body already isolates per-row failures, but a
			// query-level failure must not escape the fire-and-forget caller.
			logger.warn("[outbox-sync] drain failed", err);
		} finally {
			this.draining = false;
		}
		return synced;
	}

	private async processRow(row: OutboxRow): Promise<boolean> {
		try {
			if (row.kind === "project.create") {
				return await this.processProjectCreate(row);
			}
			if (row.kind === "workspace.create") {
				return await this.processWorkspaceCreate(row);
			}
			logger.warn(`[outbox-sync] unknown kind '${row.kind}', deleting row`, {
				id: row.id,
			});
			this.deleteRow(row.id);
			return false;
		} catch (err) {
			this.recordFailure(row, err);
			return false;
		}
	}

	private async processProjectCreate(row: OutboxRow): Promise<boolean> {
		const payload = JSON.parse(row.payloadJson) as ProjectCreatePayload;
		const local = this.ctx.db
			.select({ id: projects.id, syncState: projects.syncState })
			.from(projects)
			.where(eq(projects.id, payload.localProjectId))
			.get();

		// Local project deleted out from under us, or already linked: drop row.
		if (!local) {
			this.deleteRow(row.id);
			return false;
		}
		if (local.syncState === "synced") {
			this.deleteRow(row.id);
			return false;
		}

		try {
			await createCloudProjectWithSlugRetry(this.ctx, {
				id: payload.localProjectId,
				name: payload.name,
				repoCloneUrl: payload.repoCloneUrl,
			});
		} catch (err) {
			// A prior drain already created the cloud row with our id; only the
			// local link-back was lost. Idempotent success.
			if (!isProjectIdAlreadyInUse(err)) throw err;
			logger.warn(
				"[outbox-sync] project already in cloud (id in use); linking",
				{ projectId: payload.localProjectId },
			);
		}

		this.ctx.db
			.update(projects)
			.set({ cloudId: payload.localProjectId, syncState: "synced" })
			.where(eq(projects.id, payload.localProjectId))
			.run();
		this.deleteRow(row.id);
		return true;
	}

	private async processWorkspaceCreate(row: OutboxRow): Promise<boolean> {
		const payload = JSON.parse(row.payloadJson) as WorkspaceCreatePayload;
		const localWs = this.ctx.db
			.select({ id: workspaces.id, syncState: workspaces.syncState })
			.from(workspaces)
			.where(eq(workspaces.id, payload.localWorkspaceId))
			.get();
		if (!localWs) {
			this.deleteRow(row.id);
			return false;
		}
		if (localWs.syncState === "synced") {
			this.deleteRow(row.id);
			return false;
		}

		// The cloud workspace FK-requires a synced project. If the project row
		// hasn't drained yet, defer this row a short while (don't burn an
		// attempt — it's not a failure, just ordering).
		const project = this.ctx.db
			.select({ syncState: projects.syncState })
			.from(projects)
			.where(eq(projects.id, payload.localProjectId))
			.get();
		if (!project) {
			this.deleteRow(row.id);
			return false;
		}
		if (project.syncState !== "synced") {
			this.ctx.db
				.update(syncOutbox)
				.set({ nextAttemptAt: Date.now() + BASE_BACKOFF_MS })
				.where(eq(syncOutbox.id, row.id))
				.run();
			return false;
		}

		const cloud = await createCloudMainWorkspace(this.ctx, {
			projectId: payload.localProjectId,
			branch: payload.branch,
		});

		this.ctx.db
			.update(workspaces)
			.set({ cloudId: cloud.id, syncState: "synced" })
			.where(eq(workspaces.id, payload.localWorkspaceId))
			.run();
		this.deleteRow(row.id);
		return true;
	}

	private recordFailure(row: OutboxRow, err: unknown): void {
		const attempts = row.attempts + 1;
		const message = err instanceof Error ? err.message : String(err);
		const parked = attempts >= this.maxAttempts;
		// Park exhausted rows far in the future rather than deleting them, so the
		// evidence survives for diagnosis and a later manual re-drive.
		const nextAttemptAt = parked
			? Date.now() + MAX_BACKOFF_MS
			: Date.now() + backoffMs(attempts);

		this.ctx.db
			.update(syncOutbox)
			.set({ attempts, lastError: message, nextAttemptAt })
			.where(eq(syncOutbox.id, row.id))
			.run();

		// Mark the entity as error (transient — flips back to synced on the next
		// successful drain). Best-effort; never throws.
		this.markEntityError(row);
		logger.warn(`[outbox-sync] ${row.kind} failed (attempt ${attempts})`, {
			id: row.id,
			error: message,
			parked,
		});
	}

	private markEntityError(row: OutboxRow): void {
		try {
			if (row.kind === "project.create") {
				const { localProjectId } = JSON.parse(
					row.payloadJson,
				) as ProjectCreatePayload;
				this.ctx.db
					.update(projects)
					.set({ syncState: "error" })
					.where(
						and(
							eq(projects.id, localProjectId),
							eq(projects.syncState, "pending"),
						),
					)
					.run();
			} else if (row.kind === "workspace.create") {
				const { localWorkspaceId } = JSON.parse(
					row.payloadJson,
				) as WorkspaceCreatePayload;
				this.ctx.db
					.update(workspaces)
					.set({ syncState: "error" })
					.where(
						and(
							eq(workspaces.id, localWorkspaceId),
							eq(workspaces.syncState, "pending"),
						),
					)
					.run();
			}
		} catch {
			// best-effort diagnostic write
		}
	}

	private deleteRow(id: string): void {
		this.ctx.db.delete(syncOutbox).where(eq(syncOutbox.id, id)).run();
	}
}
