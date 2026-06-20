import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
	defaultWorktreesRoot,
	normalizeWorktreeBaseDir,
	projectWorktreesRoot,
	safeResolveWorktreePath,
} from "./worktree-paths";

describe("defaultWorktreesRoot", () => {
	test("resolves to ~/rox/worktrees", () => {
		expect(defaultWorktreesRoot()).toBe(join(homedir(), "rox", "worktrees"));
	});
});

describe("normalizeWorktreeBaseDir", () => {
	test("returns null for null/undefined input", () => {
		expect(normalizeWorktreeBaseDir(null)).toBeNull();
		expect(normalizeWorktreeBaseDir(undefined)).toBeNull();
	});

	test("returns null for empty / whitespace-only input", () => {
		expect(normalizeWorktreeBaseDir("")).toBeNull();
		expect(normalizeWorktreeBaseDir("   ")).toBeNull();
	});

	test("expands a bare ~ to the home directory", () => {
		expect(normalizeWorktreeBaseDir("~")).toBe(homedir());
	});

	test("expands ~/path to a home-relative path", () => {
		expect(normalizeWorktreeBaseDir("~/code/worktrees")).toBe(
			join(homedir(), "code", "worktrees"),
		);
	});

	test("trims surrounding whitespace before processing", () => {
		expect(normalizeWorktreeBaseDir("  ~/code  ")).toBe(
			join(homedir(), "code"),
		);
	});

	test("passes through absolute paths via resolve", () => {
		expect(normalizeWorktreeBaseDir("/tmp/wt")).toBe(resolve("/tmp/wt"));
	});

	test("normalizes an absolute path with redundant segments", () => {
		expect(normalizeWorktreeBaseDir("/tmp/a/../b")).toBe(resolve("/tmp/b"));
	});

	test("rejects a non-absolute, non-tilde path", () => {
		expect(() => normalizeWorktreeBaseDir("relative/path")).toThrow(
			"Worktree location must be an absolute path or start with ~",
		);
	});

	test("does NOT treat ~user (no slash) as home expansion → rejected", () => {
		// `~foo` has rest = "foo" which does not start with a separator, so it
		// is not expanded and falls through to the absolute-path check.
		expect(() => normalizeWorktreeBaseDir("~foo")).toThrow(
			"Worktree location must be an absolute path or start with ~",
		);
	});
});

describe("projectWorktreesRoot", () => {
	test("joins the project id under an explicit base dir", () => {
		expect(projectWorktreesRoot("proj-1", "/tmp/wt")).toBe(
			resolve("/tmp/wt", "proj-1"),
		);
	});

	test("falls back to the default root when base dir is null/undefined", () => {
		expect(projectWorktreesRoot("proj-1", null)).toBe(
			resolve(defaultWorktreesRoot(), "proj-1"),
		);
		expect(projectWorktreesRoot("proj-1")).toBe(
			resolve(defaultWorktreesRoot(), "proj-1"),
		);
	});
});

describe("safeResolveWorktreePath", () => {
	test("resolves a simple branch under the project root", () => {
		const root = resolve("/tmp/wt", "proj-1");
		expect(safeResolveWorktreePath("proj-1", "my-branch", "/tmp/wt")).toBe(
			resolve(root, "my-branch"),
		);
	});

	test("allows nested branch names with slashes", () => {
		const root = resolve("/tmp/wt", "proj-1");
		expect(safeResolveWorktreePath("proj-1", "feat/sub", "/tmp/wt")).toBe(
			resolve(root, "feat/sub"),
		);
	});

	test("rejects branch names that escape the project root via ..", () => {
		expect(() =>
			safeResolveWorktreePath("proj-1", "../escape", "/tmp/wt"),
		).toThrow(/path traversal detected/);
	});

	test("rejects an absolute branch path that lands outside the root", () => {
		expect(() =>
			safeResolveWorktreePath("proj-1", "/etc/passwd", "/tmp/wt"),
		).toThrow(/path traversal detected/);
	});

	test("rejects a sibling-prefix escape that is not under root + sep", () => {
		// resolve(<root>, "../proj-1-evil") would share the prefix string but is
		// a different directory; the `+ sep` guard must reject it.
		expect(() =>
			safeResolveWorktreePath("proj-1", "../proj-1-evil", "/tmp/wt"),
		).toThrow(/path traversal detected/);
	});

	test("resolved path stays within the project root", () => {
		const root = resolve("/tmp/wt", "proj-1");
		const out = safeResolveWorktreePath("proj-1", "branch", "/tmp/wt");
		expect(out.startsWith(root + sep)).toBe(true);
	});
});
