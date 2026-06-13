import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listExternalWorktrees } from "./git";
import { selectExternalWorktreesForImport } from "./select-external-worktrees-for-import";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`rox-test-select-import-${process.pid}`,
);
const REAL_GIT_TEST_TIMEOUT_MS = 30_000;

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add . && git commit -m 'init'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	return repoPath;
}

function addWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add "${worktreePath}" -b ${branch}`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
}

function addDetachedWorktree(mainRepoPath: string, worktreePath: string): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add --detach "${worktreePath}" HEAD`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
}

describe("selectExternalWorktreesForImport (real git worktrees)", () => {
	let mainRepoPath: string;
	let wtA: string;
	let wtB: string;
	let wtC: string;

	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
		mainRepoPath = createTestRepo("main-repo");
		wtA = join(TEST_DIR, "wt-a");
		wtB = join(TEST_DIR, "wt-b");
		wtC = join(TEST_DIR, "wt-c");
		addWorktree(mainRepoPath, "feat-a", wtA);
		addWorktree(mainRepoPath, "feat-b", wtB);
		addWorktree(mainRepoPath, "feat-c", wtC);
	}, REAL_GIT_TEST_TIMEOUT_MS);

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	}, REAL_GIT_TEST_TIMEOUT_MS);

	test(
		"with no requested filter, returns all three external worktrees and excludes main repo",
		async () => {
			const all = await listExternalWorktrees(mainRepoPath);
			expect(all.map((w) => w.path).sort()).toEqual(
				[mainRepoPath, wtA, wtB, wtC].sort(),
			);

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
			});
			expect(result.map((w) => w.path).sort()).toEqual(
				[wtA, wtB, wtC].sort(),
			);
			expect(result.map((w) => w.branch).sort()).toEqual(
				["feat-a", "feat-b", "feat-c"].sort(),
			);
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);

	test(
		"with requested = {wtA, wtC}, returns only those two",
		async () => {
			const all = await listExternalWorktrees(mainRepoPath);

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
				requested: new Set([wtA, wtC]),
			});
			expect(result.map((w) => w.path).sort()).toEqual([wtA, wtC].sort());
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);

	test(
		"requested set containing a path that no longer exists is silently ignored",
		async () => {
			const all = await listExternalWorktrees(mainRepoPath);
			const ghostPath = join(TEST_DIR, "wt-ghost");

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
				requested: new Set([wtA, ghostPath]),
			});
			expect(result.map((w) => w.path)).toEqual([wtA]);
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);

	test(
		"detached HEAD worktrees are skipped even when requested",
		async () => {
			const wtDetached = join(TEST_DIR, "wt-detached");
			addDetachedWorktree(mainRepoPath, wtDetached);

			const all = await listExternalWorktrees(mainRepoPath);
			const detachedEntry = all.find((w) => w.path === wtDetached);
			expect(detachedEntry).toBeDefined();
			expect(detachedEntry?.isDetached).toBe(true);

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
				requested: new Set([wtA, wtDetached]),
			});
			expect(result.map((w) => w.path)).toEqual([wtA]);
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);

	test(
		"empty requested set returns no worktrees",
		async () => {
			const all = await listExternalWorktrees(mainRepoPath);

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
				requested: new Set(),
			});
			expect(result).toEqual([]);
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);

	test(
		"main repo path in the requested set never gets imported",
		async () => {
			const all = await listExternalWorktrees(mainRepoPath);

			const result = selectExternalWorktreesForImport(all, {
				mainRepoPath,
				requested: new Set([mainRepoPath, wtA]),
			});
			expect(result.map((w) => w.path)).toEqual([wtA]);
		},
		REAL_GIT_TEST_TIMEOUT_MS,
	);
});
