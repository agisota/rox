import { describe, expect, it } from "bun:test";
import { resolveTreeMove } from "./resolveTreeMove";

describe("resolveTreeMove", () => {
	it("moves a root-level file into a folder", () => {
		expect(resolveTreeMove("a.txt", "src", false)).toEqual({
			ok: true,
			sourcePath: "a.txt",
			destinationPath: "src/a.txt",
		});
	});

	it("moves a nested file into the worktree root", () => {
		expect(resolveTreeMove("src/a.txt", "", false)).toEqual({
			ok: true,
			sourcePath: "src/a.txt",
			destinationPath: "a.txt",
		});
	});

	it("moves a file between sibling folders", () => {
		expect(resolveTreeMove("src/a.txt", "lib", false)).toEqual({
			ok: true,
			sourcePath: "src/a.txt",
			destinationPath: "lib/a.txt",
		});
	});

	it("keeps trailing slashes when moving a folder", () => {
		expect(resolveTreeMove("src/utils/", "lib", true)).toEqual({
			ok: true,
			sourcePath: "src/utils/",
			destinationPath: "lib/utils/",
		});
	});

	it("accepts a directory destination key with a trailing slash", () => {
		expect(resolveTreeMove("a.txt", "src/", false)).toEqual({
			ok: true,
			sourcePath: "a.txt",
			destinationPath: "src/a.txt",
		});
	});

	it("skips a no-op drop into the current parent", () => {
		expect(resolveTreeMove("src/a.txt", "src", false)).toEqual({
			ok: false,
			reason: "same-parent",
		});
	});

	it("skips a no-op drop of a root-level file onto the root", () => {
		expect(resolveTreeMove("a.txt", "", false)).toEqual({
			ok: false,
			reason: "same-parent",
		});
	});

	it("rejects dropping a folder into itself", () => {
		expect(resolveTreeMove("src/", "src", true)).toEqual({
			ok: false,
			reason: "into-self",
		});
	});

	it("rejects dropping a folder into its own descendant", () => {
		expect(resolveTreeMove("src/", "src/nested", true)).toEqual({
			ok: false,
			reason: "into-self",
		});
	});

	it("allows a folder move into a sibling whose name shares a prefix", () => {
		// "src-extra" starts with "src" textually but is not a descendant of
		// "src/"; the descendant guard must use the path separator.
		expect(resolveTreeMove("src/", "src-extra", true)).toEqual({
			ok: true,
			sourcePath: "src/",
			destinationPath: "src-extra/src/",
		});
	});
});
