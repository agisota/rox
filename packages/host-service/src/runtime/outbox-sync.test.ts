import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import { projects, syncOutbox, workspaces } from "../db/schema";
import {
	enqueueProjectCreate,
	enqueueWorkspaceCreate,
} from "../trpc/router/project/utils/outbox";
import type { ApiClient } from "../types";
import { backoffMs, OutboxSyncManager } from "./outbox-sync";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");
const ORG = "00000000-0000-0000-0000-000000000001";

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema: { projects, workspaces, syncOutbox } });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

interface ApiCallLog {
	projectCreate: number;
	workspaceCreate: number;
	hostEnsure: number;
}

/**
 * Minimal fake cloud api for the worker. `projectCreate` can be told to throw
 * (offline) or to throw the "id already in use" CONFLICT (idempotent replay).
 */
function makeFakeApi(opts: {
	projectCreate?: (input: {
		id: string;
		name: string;
		slug: string;
	}) => unknown;
}): { client: ApiClient; calls: ApiCallLog } {
	const calls: ApiCallLog = {
		projectCreate: 0,
		workspaceCreate: 0,
		hostEnsure: 0,
	};
	const client = {
		v2Project: {
			create: {
				mutate: async (input: { id: string; name: string; slug: string }) => {
					calls.projectCreate++;
					if (opts.projectCreate) return opts.projectCreate(input);
					return { id: input.id, name: input.name, slug: input.slug };
				},
			},
		},
		host: {
			ensure: {
				mutate: async () => {
					calls.hostEnsure++;
					return { machineId: "test-machine" };
				},
			},
		},
		v2Workspace: {
			create: {
				mutate: async (input: { projectId: string; branch: string }) => {
					calls.workspaceCreate++;
					return {
						id: randomUUID(),
						projectId: input.projectId,
						branch: input.branch,
						name: input.branch,
					};
				},
			},
		},
	} as unknown as ApiClient;
	return { client, calls };
}

/** Seed a local-first project + workspace + their outbox rows (pending). */
function seedLocalFirstCreate(db: HostDb): {
	projectId: string;
	workspaceId: string;
} {
	const projectId = randomUUID();
	const workspaceId = randomUUID();
	db.insert(projects)
		.values({
			id: projectId,
			repoPath: `/tmp/${projectId}`,
			syncState: "pending",
		})
		.run();
	db.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath: `/tmp/${projectId}`,
			branch: "main",
			syncState: "pending",
		})
		.run();
	enqueueProjectCreate(db, { localProjectId: projectId, name: "Seeded" });
	enqueueWorkspaceCreate(db, {
		localWorkspaceId: workspaceId,
		localProjectId: projectId,
		repoPath: `/tmp/${projectId}`,
		branch: "main",
	});
	return { projectId, workspaceId };
}

describe("OutboxSyncManager", () => {
	let stops: Array<() => void> = [];
	afterEach(() => {
		for (const stop of stops) stop();
		stops = [];
	});

	it("(b) drains pending rows when cloud reachable: links cloud id + syncState=synced + deletes rows", async () => {
		const db = createTestDb();
		const { projectId, workspaceId } = seedLocalFirstCreate(db);
		const { client, calls } = makeFakeApi({});
		const mgr = new OutboxSyncManager({ db, api: client, organizationId: ORG });
		stops.push(() => mgr.stop());

		// First drain syncs the project; the workspace row defers until the
		// project is synced, so a second drain completes it.
		await mgr.drainOnce();
		await mgr.drainOnce();

		const project = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		expect(project?.syncState).toBe("synced");
		expect(project?.cloudId).toBe(projectId); // cloud id == local id

		const ws = db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		expect(ws?.syncState).toBe("synced");
		expect(ws?.cloudId).toBeTruthy();

		// Both outbox rows consumed.
		expect(db.select().from(syncOutbox).all()).toHaveLength(0);
		expect(calls.projectCreate).toBe(1);
		expect(calls.workspaceCreate).toBe(1);
	});

	it("(c) idempotency: re-enqueue is a no-op and a repeated drain never double-creates", async () => {
		const db = createTestDb();
		const { projectId } = seedLocalFirstCreate(db);

		// Re-enqueue the SAME project op — dedup key collision → still one row.
		enqueueProjectCreate(db, { localProjectId: projectId, name: "Seeded" });
		const projectRows = db
			.select()
			.from(syncOutbox)
			.where(eq(syncOutbox.kind, "project.create"))
			.all();
		expect(projectRows).toHaveLength(1);

		const { client, calls } = makeFakeApi({});
		const mgr = new OutboxSyncManager({ db, api: client, organizationId: ORG });
		stops.push(() => mgr.stop());

		await mgr.drainOnce();
		// Draining again after the project is already synced must NOT call the
		// cloud a second time for the project.
		await mgr.drainOnce();
		await mgr.drainOnce();

		expect(calls.projectCreate).toBe(1);
	});

	it("(c) idempotency: a cloud 'id already in use' replay is treated as success, not a double-create", async () => {
		const db = createTestDb();
		const { projectId } = seedLocalFirstCreate(db);

		// Simulate: the cloud row was already created by a prior crash-truncated
		// drain, so create now throws the PK-collision CONFLICT.
		const { client, calls } = makeFakeApi({
			projectCreate: () => {
				throw new Error("Project id already in use");
			},
		});
		const mgr = new OutboxSyncManager({ db, api: client, organizationId: ORG });
		stops.push(() => mgr.stop());

		await mgr.drainOnce();

		const project = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		// Linked as synced despite the throw.
		expect(project?.syncState).toBe("synced");
		expect(project?.cloudId).toBe(projectId);
		// The project.create outbox row is gone.
		expect(
			db
				.select()
				.from(syncOutbox)
				.where(eq(syncOutbox.kind, "project.create"))
				.all(),
		).toHaveLength(0);
		expect(calls.projectCreate).toBe(1);
	});

	it("offline: an unreachable cloud leaves rows pending with backoff, marks entity error, no throw", async () => {
		const db = createTestDb();
		const { projectId } = seedLocalFirstCreate(db);
		const { client } = makeFakeApi({
			projectCreate: () => {
				throw new Error("ECONNREFUSED");
			},
		});
		const mgr = new OutboxSyncManager({ db, api: client, organizationId: ORG });
		stops.push(() => mgr.stop());

		// Must not throw even though every cloud call fails.
		const synced = await mgr.drainOnce();
		expect(synced).toBe(0);

		const project = db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		expect(project?.syncState).toBe("error");
		expect(project?.cloudId).toBeNull();

		const projectOutbox = db
			.select()
			.from(syncOutbox)
			.where(eq(syncOutbox.kind, "project.create"))
			.get();
		expect(projectOutbox?.attempts).toBe(1);
		expect(projectOutbox?.lastError).toContain("ECONNREFUSED");
		expect(projectOutbox?.nextAttemptAt).toBeGreaterThan(Date.now());
	});

	it("backoffMs grows exponentially and caps at 5 minutes", () => {
		expect(backoffMs(1)).toBe(5_000);
		expect(backoffMs(2)).toBe(10_000);
		expect(backoffMs(3)).toBe(20_000);
		expect(backoffMs(100)).toBe(5 * 60_000);
	});
});
