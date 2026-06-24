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
import { cloudOk } from "../helpers/cloud-fakes";
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
