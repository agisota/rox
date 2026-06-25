import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";
import {
	BLAME_LOG_FORMAT,
	getFileBlameAuthor,
	parseBlameLogLine,
} from "./utils/blame";

/**
 * F35 — identity-aware tree blame. Verifies `git.getBlame`'s core resolver
 * (`getFileBlameAuthor`) against a real repo: last-author per file path,
 * rename-following, and the "no history" degrade path.
 */

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

async function commitAs(
	git: SimpleGit,
	cwd: string,
	name: string,
	content: string,
	message: string,
	author: { name: string; email: string },
): Promise<void> {
	await writeFile(join(cwd, name), content);
	await git.raw(["add", "--", name]);
	await git.raw([
		"-c",
		`user.name=${author.name}`,
		"-c",
		`user.email=${author.email}`,
		"commit",
		"-m",
		message,
	]);
}

function mkTmp(): string {
	return mkdtempSync(join(tmpdir(), "rox-blame-"));
}

describe("F35 — git blame line parser", () => {
	test("parses a well-formed log line into epoch-ms blame", () => {
		const line = `abc123\x1fAda Lovelace\x1fada@example.com\x1f1700000000`;
		expect(parseBlameLogLine(line)).toEqual({
			commit: "abc123",
			name: "Ada Lovelace",
			email: "ada@example.com",
			timestamp: 1700000000 * 1000,
		});
	});

	test("returns null for empty or malformed output", () => {
		expect(parseBlameLogLine("")).toBeNull();
		expect(parseBlameLogLine("   ")).toBeNull();
		expect(parseBlameLogLine("only-a-sha")).toBeNull();
	});

	test("tolerates commas/tabs in author name (unit-separator delimited)", () => {
		const line = `sha\x1fLast, First\tJr\x1fx@y.z\x1f1`;
		expect(parseBlameLogLine(line)?.name).toBe("Last, First\tJr");
	});

	test("BLAME_LOG_FORMAT carries exactly four %x1f-separated fields", () => {
		expect(BLAME_LOG_FORMAT.split("%x1f")).toHaveLength(4);
	});
});

describe("F35 — getFileBlameAuthor (real repo)", () => {
	let repo: string;
	let git: SimpleGit;

	beforeEach(async () => {
		repo = mkTmp();
		git = await initRepo(repo);
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("returns the last author who touched the file", async () => {
		await commitAs(git, repo, "a.ts", "v1\n", "first", {
			name: "Alice",
			email: "alice@example.com",
		});
		await commitAs(git, repo, "a.ts", "v2\n", "second", {
			name: "Bob",
			email: "bob@example.com",
		});

		const blame = await getFileBlameAuthor(git, "a.ts");
		expect(blame).not.toBeNull();
		expect(blame?.name).toBe("Bob");
		expect(blame?.email).toBe("bob@example.com");
		expect(blame?.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(blame?.timestamp).toBeGreaterThan(0);
		// Epoch-ms, not seconds — must be in the millisecond range.
		expect(String(blame?.timestamp)).toHaveLength(13);
	});

	test("does not attribute a sibling file's author", async () => {
		await commitAs(git, repo, "a.ts", "a\n", "a", {
			name: "Alice",
			email: "alice@example.com",
		});
		await commitAs(git, repo, "b.ts", "b\n", "b", {
			name: "Bob",
			email: "bob@example.com",
		});

		expect((await getFileBlameAuthor(git, "a.ts"))?.name).toBe("Alice");
		expect((await getFileBlameAuthor(git, "b.ts"))?.name).toBe("Bob");
	});

	test("follows renames so authorship survives a move", async () => {
		await commitAs(git, repo, "old.ts", "x\n", "create", {
			name: "Alice",
			email: "alice@example.com",
		});
		await git.raw([
			"-c",
			"user.name=Bob",
			"-c",
			"user.email=bob@example.com",
			"mv",
			"old.ts",
			"new.ts",
		]);
		await git.raw([
			"-c",
			"user.name=Bob",
			"-c",
			"user.email=bob@example.com",
			"commit",
			"-m",
			"rename",
		]);

		const blame = await getFileBlameAuthor(git, "new.ts");
		expect(blame?.name).toBe("Bob");
	});

	test("returns null for an untracked file with no history", async () => {
		await commitAs(git, repo, "tracked.ts", "x\n", "base", {
			name: "Alice",
			email: "alice@example.com",
		});
		await writeFile(join(repo, "untracked.ts"), "y\n");

		expect(await getFileBlameAuthor(git, "untracked.ts")).toBeNull();
	});
});
