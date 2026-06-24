import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
	hostSettings,
	projects,
	syncOutbox,
	workspaces,
} from "../../src/db/schema";
import { cloudFlows, cloudOk } from "../helpers/cloud-fakes";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

/** Flip the local-first host setting on, in the host's db. */
function enableLocalFirst(host: TestHost): void {
	host.db
		.insert(hostSettings)
		.values({ id: 1, localFirstCreate: true })
		.onConflictDoUpdate({
			target: hostSettings.id,
			set: { localFirstCreate: true },
		})
		.run();
}

/** Isolated tmp parent dir so create never touches the real `~/rox/projects`. */
function makeParentDir(cleanups: Array<() => void>): string {
	const dir = mkdtempSync(join(tmpdir(), "host-lf-parent-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

describe("local-first create (flag ON)", () => {
	let dispose: (() => Promise<void>) | undefined;
	let cleanups: Array<() => void> = [];
	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
		for (const c of cleanups) c();
		cleanups = [];
	});

	test("(a) offline create: cloud unreachable → local project + workspace + pending outbox, NO throw, NO rollback", async () => {
		// No v2Project.create / v2Workspace.create mocks registered → the fake
		// api throws on any cloud call, simulating an unreachable cloud.
		const host = await createTestHost();
		dispose = host.dispose;
		enableLocalFirst(host);
		const parentDir = makeParentDir(cleanups);

		const before = host.apiCalls.length;
		const result = await host.trpc.project.create.mutate({
			name: "Offline Project",
			mode: { kind: "empty", parentDir },
		});

		// Returned instantly with a local id + a real repo on disk.
		expect(result.projectId).toBeTruthy();
		expect(result.mainWorkspaceId).toBeTruthy();
		expect(existsSync(result.repoPath)).toBe(true);
		expect(existsSync(join(result.repoPath, ".git"))).toBe(true);

		// The create call itself made ZERO cloud calls.
		expect(host.apiCalls.length).toBe(before);

		// Local project row exists, marked pending, no cloud id yet.
		const project = host.db
			.select()
			.from(projects)
			.where(eq(projects.id, result.projectId))
			.get();
		expect(project?.syncState).toBe("pending");
		expect(project?.cloudId).toBeNull();

		// Local main workspace row exists, pending.
		const ws = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.mainWorkspaceId))
			.get();
		expect(ws?.projectId).toBe(result.projectId);
		expect(ws?.syncState).toBe("pending");

		// Two pending outbox rows: project.create + workspace.create.
		const outbox = host.db.select().from(syncOutbox).all();
		expect(outbox.map((r) => r.kind).sort()).toEqual([
			"project.create",
			"workspace.create",
		]);
	});

	test("(d) projectsBaseDir threads into the create parentDir when none is passed", async () => {
		const host = await createTestHost();
		dispose = host.dispose;
		enableLocalFirst(host);

		// Point projects at an isolated tmp root via the host setting; the create
		// path mkdir's `<base>/projects` itself.
		const base = mkdtempSync(join(tmpdir(), "host-lf-base-"));
		cleanups.push(() => rmSync(base, { recursive: true, force: true }));
		const set = await host.trpc.settings.projectsLocation.set.mutate({
			path: base,
		});
		expect(set.projectsBaseDir).toBe(base);

		const result = await host.trpc.project.create.mutate({
			name: "Located Project",
			// No parentDir → host setting decides.
			mode: { kind: "empty" },
		});

		// Repo lives under <projectsBaseDir>/projects/...
		expect(result.repoPath.startsWith(join(base, "projects"))).toBe(true);
	});

	test("(e) auto-init produces a valid git repo with a resolvable HEAD on main", async () => {
		const host = await createTestHost();
		dispose = host.dispose;
		enableLocalFirst(host);
		const parentDir = makeParentDir(cleanups);

		const result = await host.trpc.project.create.mutate({
			name: "Git Inited",
			mode: { kind: "empty", parentDir },
		});

		const ws = host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, result.mainWorkspaceId))
			.get();
		expect(ws?.branch).toBe("main");
		expect(existsSync(join(result.repoPath, ".git", "HEAD"))).toBe(true);
	});
});

describe("create regression (flag OFF = unchanged behavior)", () => {
	let dispose: (() => Promise<void>) | undefined;
	let cleanups: Array<() => void> = [];
	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
		for (const c of cleanups) c();
		cleanups = [];
	});

	test("(f) flag OFF + cloud reachable → synchronous cloud create links the cloud id (no outbox)", async () => {
		// Default flag is OFF. Provide the full synchronous-cloud flow.
		const host = await createTestHost({
			apiOverrides: {
				"v2Project.create.mutate": (input) => {
					const i = input as { id: string; name: string; slug: string };
					return { id: i.id, name: i.name, slug: i.slug };
				},
				"host.ensure.mutate": cloudOk.hostEnsure(),
				"v2Workspace.create.mutate": cloudOk.workspaceCreate(),
			},
		});
		dispose = host.dispose;
		const parentDir = makeParentDir(cleanups);

		const result = await host.trpc.project.create.mutate({
			name: "Cloud Synced",
			mode: { kind: "empty", parentDir },
		});

		// Synchronous path called the cloud.
		const paths = host.apiCalls.map((c) => c.path);
		expect(paths).toContain("v2Project.create.mutate");
		expect(paths).toContain("v2Workspace.create.mutate");

		// No outbox rows — the OFF path never enqueues.
		expect(host.db.select().from(syncOutbox).all()).toHaveLength(0);

		// syncState left at the schema default 'synced'.
		const project = host.db
			.select()
			.from(projects)
			.where(eq(projects.id, result.projectId))
			.get();
		expect(project?.syncState).toBe("synced");
	});

	test("(f) flag OFF + cloud failure → rollback: local row + repo dir removed", async () => {
		// v2Project.create throws → the synchronous saga must roll everything back.
		const host = await createTestHost({
			apiOverrides: {
				"v2Project.create.mutate": () => {
					throw new Error("cloud down");
				},
			},
		});
		dispose = host.dispose;
		const parentDir = makeParentDir(cleanups);

		await expect(
			host.trpc.project.create.mutate({
				name: "Rollback Me",
				mode: { kind: "empty", parentDir },
			}),
		).rejects.toBeTruthy();

		// No project rows survive, no outbox rows.
		expect(host.db.select().from(projects).all()).toHaveLength(0);
		expect(host.db.select().from(syncOutbox).all()).toHaveLength(0);
		// The repo dir was rmSync'd by the rollback (parentDir is now empty).
		expect(existsSync(join(parentDir, "Rollback-Me"))).toBe(false);
	});
});

/**
 * Reboot survival — the load-bearing guarantee behind local-first create: a
 * project created while the cloud is unreachable enqueues durable `sync_outbox`
 * rows that MUST survive an app quit and drain on the next launch (this product
 * previously lost data on quit, so an in-memory db would not prove anything).
 *
 * The test uses a FILE-BACKED sqlite db on a real temp path, shared across two
 * separate `createTestHost` boots that dispose/reopen the SAME file — host #1 is
 * "before quit" (cloud down), host #2 is "after relaunch" (cloud up). Persisting
 * across a real handle close + reopen is the whole point; nothing here is
 * in-memory.
 */
describe("local-first create reboot survival (flag ON, file-backed db)", () => {
	let cleanups: Array<() => void> = [];
	afterEach(() => {
		for (const c of cleanups) c();
		cleanups = [];
	});

	test("(g) pending outbox survives app quit and drains on next launch with cloud reachable", async () => {
		// One real on-disk sqlite file, shared by both hosts. We own its removal
		// (both hosts get `dbPath`/`keepData`, so neither host's dispose deletes it).
		const dataDir = mkdtempSync(join(tmpdir(), "host-lf-reboot-"));
		cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
		const dbPath = join(dataDir, "host.db");
		const parentDir = makeParentDir(cleanups);

		// ── Launch #1: cloud UNREACHABLE ──────────────────────────────────────
		// No api overrides → every cloud call throws, simulating offline.
		const host1 = await createTestHost({ dbPath, keepData: true });
		enableLocalFirst(host1);

		const before = host1.apiCalls.length;
		const created = await host1.trpc.project.create.mutate({
			name: "Reboot Project",
			mode: { kind: "empty", parentDir },
		});
		const { projectId, mainWorkspaceId } = created;

		// Instant local create, ZERO cloud calls, real repo on disk.
		expect(host1.apiCalls.length).toBe(before);
		expect(existsSync(join(created.repoPath, ".git"))).toBe(true);

		// Local rows pending, no cloud link yet; two durable outbox rows enqueued.
		expect(
			host1.db.select().from(projects).where(eq(projects.id, projectId)).get()
				?.syncState,
		).toBe("pending");
		expect(
			host1.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, mainWorkspaceId))
				.get()?.syncState,
		).toBe("pending");
		expect(host1.db.select().from(syncOutbox).all()).toHaveLength(2);

		// ── Quit: dispose host #1 (closes the sqlite handle; file persists) ────
		await host1.dispose();

		// ── Launch #2: SAME file, cloud now REACHABLE ─────────────────────────
		const host2 = await createTestHost({
			dbPath,
			keepData: true,
			apiOverrides: {
				"v2Project.create.mutate": (input) => {
					const i = input as { id: string; name: string; slug: string };
					return { id: i.id, name: i.name, slug: i.slug };
				},
				...cloudFlows.workspaceCreateOk(),
			},
		});
		cleanups.push(() => {
			void host2.dispose();
		});

		// PROOF OF PERSISTENCE: the pending state written by host #1 is readable
		// from a fresh handle on the same file, BEFORE we drain anything.
		const reopenedProject = host2.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		expect(reopenedProject?.syncState).toBe("pending");
		expect(reopenedProject?.cloudId).toBeNull();
		expect(host2.db.select().from(syncOutbox).all()).toHaveLength(2);

		// Drive the drain to completion. The workspace row defers itself (bumps
		// `nextAttemptAt` ~5s out) until the project is synced, and the auto-start
		// poller may interleave its own immediate drain — so rather than assume an
		// exact drain count, loop: clear any defer backoff and drain until the
		// outbox is empty (bounded), which is what the real 15s poller does over
		// time. The `draining` guard makes any concurrent poller drain a safe
		// no-op.
		for (let i = 0; i < 10; i++) {
			if (host2.db.select().from(syncOutbox).all().length === 0) break;
			// Reset the defer gate so the deferred workspace row is eligible now.
			host2.db.update(syncOutbox).set({ nextAttemptAt: 0 }).run();
			await host2.outboxSync.drainOnce();
		}

		// The outbox fully drained.
		expect(host2.db.select().from(syncOutbox).all()).toHaveLength(0);

		// Local project linked to its cloud id and synced.
		const syncedProject = host2.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		expect(syncedProject?.syncState).toBe("synced");
		expect(syncedProject?.cloudId).toBe(projectId); // cloud id == local id

		// Local main workspace linked + synced.
		const syncedWs = host2.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, mainWorkspaceId))
			.get();
		expect(syncedWs?.syncState).toBe("synced");
		expect(syncedWs?.cloudId).toBeTruthy();
	});
});

/**
 * Local-failure orphan guard (flag ON): if the local main-workspace step throws
 * AFTER the project row is persisted, the project must NOT be orphaned as
 * `pending`-with-no-outbox-row (which would never drive itself to the cloud).
 * `persistLocalFirst` enqueues the project-create BEFORE the workspace step, so
 * even on a workspace failure the project still syncs and the boot sweep
 * reconciles the missing main workspace later.
 */
describe("local-first create local-failure ordering (flag ON)", () => {
	let dispose: (() => Promise<void>) | undefined;
	let cleanups: Array<() => void> = [];
	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
		for (const c of cleanups) c();
		cleanups = [];
	});

	test("(h) workspace step throws → project row + project.create outbox still enqueued (no orphan)", async () => {
		// Inject a git factory that always rejects, so `ensureMainWorkspaceLocal`
		// (the first `ctx.git(...)` in the create path) throws AFTER the project
		// row + the project-create outbox row are already written.
		const host = await createTestHost({
			gitFactory: async () => {
				throw new Error("simulated local git failure");
			},
		});
		dispose = host.dispose;
		enableLocalFirst(host);
		const parentDir = makeParentDir(cleanups);

		// The create rejects (a genuine LOCAL failure propagates; only cloud
		// failures are swallowed by local-first).
		await expect(
			host.trpc.project.create.mutate({
				name: "Orphan Guard",
				mode: { kind: "empty", parentDir },
			}),
		).rejects.toBeTruthy();

		// Exactly one project row survives, still pending (no rollback on the
		// local-first path) — and crucially it is NOT orphaned: its project-create
		// outbox row exists, so the worker will still drive it to the cloud.
		const projectRows = host.db.select().from(projects).all();
		expect(projectRows).toHaveLength(1);
		expect(projectRows[0]?.syncState).toBe("pending");

		const outbox = host.db.select().from(syncOutbox).all();
		expect(outbox.map((r) => r.kind)).toEqual(["project.create"]);
		// The project-create payload targets the surviving project row.
		const payload = JSON.parse(outbox[0]?.payloadJson ?? "{}") as {
			localProjectId: string;
		};
		expect(payload.localProjectId).toBe(projectRows[0]?.id);

		// The workspace step failed before persisting anything: no workspace row,
		// no workspace.create outbox row. The boot sweep recreates the main
		// workspace once the project has synced.
		expect(host.db.select().from(workspaces).all()).toHaveLength(0);
		expect(outbox.some((r) => r.kind === "workspace.create")).toBe(false);
	});
});
