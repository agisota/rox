import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import {
	createFile,
	createSkill,
	deleteFile,
	deleteSkill,
	duplicateSkill,
	renameFile,
	resolveInside,
	scaffoldSkillMd,
	validateSkillName,
} from "./lifecycle";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "rox-skills-lifecycle-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("validateSkillName", () => {
	test("accepts a clean name and trims it", () => {
		expect(validateSkillName("  my-skill  ")).toBe("my-skill");
	});

	test.each([
		["", "empty"],
		[".hidden", "leading dot"],
		["a/b", "slash"],
		["a\\b", "backslash"],
		["../escape", "traversal"],
		["bad*name", "invalid char"],
	])("rejects %p (%s)", (name) => {
		expect(() => validateSkillName(name)).toThrow(TRPCError);
	});
});

describe("resolveInside", () => {
	test("resolves a nested relative path under the base", () => {
		const target = resolveInside(root, "docs/readme.md");
		expect(target).toBe(join(root, "docs/readme.md"));
	});

	test.each([
		"../escape.txt",
		"/etc/passwd",
		"a/../../b",
	])("rejects traversal %p", (rel) => {
		expect(() => resolveInside(root, rel)).toThrow(TRPCError);
	});

	test("rejects empty path and the base itself", () => {
		expect(() => resolveInside(root, "  ")).toThrow(TRPCError);
		expect(() => resolveInside(root, ".")).toThrow(TRPCError);
	});
});

describe("scaffoldSkillMd", () => {
	test("emits frontmatter with name + description matching the parser shape", () => {
		const md = scaffoldSkillMd("demo");
		expect(md.startsWith("---\nname: demo\ndescription: ")).toBe(true);
		expect(md).toContain("\n---\n");
		expect(md).toContain("# demo");
	});
});

describe("createSkill", () => {
	test("creates dir + scaffolded SKILL.md", () => {
		const slug = createSkill(root, "fresh");
		expect(slug).toBe("fresh");
		expect(existsSync(join(root, "fresh", "SKILL.md"))).toBe(true);
		expect(readFileSync(join(root, "fresh", "SKILL.md"), "utf-8")).toContain(
			"name: fresh",
		);
	});

	test("rejects a duplicate skill", () => {
		createSkill(root, "dup");
		expect(() => createSkill(root, "dup")).toThrow(TRPCError);
	});
});

describe("deleteSkill", () => {
	test("removes the whole directory", () => {
		createSkill(root, "gone");
		deleteSkill(root, join(root, "gone"));
		expect(existsSync(join(root, "gone"))).toBe(false);
	});

	test("refuses to delete the root itself", () => {
		expect(() => deleteSkill(root, root)).toThrow(TRPCError);
	});

	test("refuses a dir outside the root", () => {
		expect(() => deleteSkill(root, join(tmpdir(), "elsewhere"))).toThrow(
			TRPCError,
		);
	});
});

describe("duplicateSkill", () => {
	test("copies files and rewrites the SKILL.md name", () => {
		createSkill(root, "orig");
		writeFileSync(join(root, "orig", "extra.txt"), "hi", "utf-8");
		const slug = duplicateSkill(root, join(root, "orig"), "copy");
		expect(slug).toBe("copy");
		expect(existsSync(join(root, "copy", "extra.txt"))).toBe(true);
		expect(readFileSync(join(root, "copy", "SKILL.md"), "utf-8")).toContain(
			"name: copy",
		);
	});

	test("rejects when destination exists", () => {
		createSkill(root, "orig");
		createSkill(root, "taken");
		expect(() => duplicateSkill(root, join(root, "orig"), "taken")).toThrow(
			TRPCError,
		);
	});
});

describe("file lifecycle", () => {
	test("create, rename, delete a file", () => {
		const dir = join(root, "skill");
		createSkill(root, "skill");
		createFile(dir, "notes.md");
		expect(existsSync(join(dir, "notes.md"))).toBe(true);

		renameFile(dir, "notes.md", "docs/notes.md");
		expect(existsSync(join(dir, "notes.md"))).toBe(false);
		expect(existsSync(join(dir, "docs/notes.md"))).toBe(true);

		deleteFile(dir, "docs/notes.md");
		expect(existsSync(join(dir, "docs/notes.md"))).toBe(false);
	});

	test("createFile rejects an existing file", () => {
		const dir = join(root, "skill");
		createSkill(root, "skill");
		expect(() => createFile(dir, "SKILL.md")).toThrow(TRPCError);
	});

	test("renameFile rejects when destination exists", () => {
		const dir = join(root, "skill");
		createSkill(root, "skill");
		createFile(dir, "a.txt");
		expect(() => renameFile(dir, "a.txt", "SKILL.md")).toThrow(TRPCError);
	});

	test("file ops reject path traversal", () => {
		const dir = join(root, "skill");
		createSkill(root, "skill");
		expect(() => createFile(dir, "../escape.txt")).toThrow(TRPCError);
		expect(() => deleteFile(dir, "../../etc/passwd")).toThrow(TRPCError);
		expect(() => renameFile(dir, "SKILL.md", "../x.md")).toThrow(TRPCError);
	});
});
