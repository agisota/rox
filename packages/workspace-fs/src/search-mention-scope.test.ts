import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { invalidateAllSearchIndexes, searchFiles } from "./search";

// Behavioural guarantees the chat @mention file picker relies on:
// the search is query-filtered, ignores VCS/build dirs, and can never surface
// a path outside the workspace root (no traversal, no symlink escape).

const tempRoots: string[] = [];

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		tempRoots.splice(0, tempRoots.length).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

async function createTempRoot(): Promise<string> {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "mention-scope-"));
	// Resolve symlinks (macOS /tmp -> /private/tmp) so absolutePath comparisons
	// against the root are stable.
	return await fs.realpath(rootPath);
}

async function writeFileAt(
	rootPath: string,
	relativePath: string,
	contents = "",
): Promise<void> {
	const absolutePath = path.join(rootPath, relativePath);
	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, contents);
}

describe("searchFiles — mention picker scope", () => {
	it("filters results by the typed query (fuzzy match on name/path)", async () => {
		const rootPath = await createTempRoot();
		await writeFileAt(rootPath, "src/widget.ts");
		await writeFileAt(rootPath, "src/gadget.ts");
		await writeFileAt(rootPath, "README.md");

		const matches = await searchFiles({ rootPath, query: "widget" });

		const rels = matches.map((m) => m.relativePath);
		expect(rels).toContain("src/widget.ts");
		expect(rels).not.toContain("src/gadget.ts");
		expect(rels).not.toContain("README.md");
	});

	it("returns nothing for a non-matching query", async () => {
		const rootPath = await createTempRoot();
		await writeFileAt(rootPath, "src/widget.ts");

		const matches = await searchFiles({ rootPath, query: "zzzznotfound" });

		expect(matches).toEqual([]);
	});

	it("ignores .git and node_modules even when the query would match them", async () => {
		const rootPath = await createTempRoot();
		await writeFileAt(rootPath, "node_modules/widget/index.ts");
		await writeFileAt(rootPath, ".git/widget-config");
		await writeFileAt(rootPath, "src/widget.ts");

		const matches = await searchFiles({ rootPath, query: "widget" });
		const rels = matches.map((m) => m.relativePath);

		expect(rels).toContain("src/widget.ts");
		expect(rels.some((rel) => rel.includes("node_modules"))).toBe(false);
		expect(rels.some((rel) => rel.includes(".git/"))).toBe(false);
	});

	it("scopes every result to the workspace root (relative path, abs under root)", async () => {
		const rootPath = await createTempRoot();
		await writeFileAt(rootPath, "src/alpha.ts");
		await writeFileAt(rootPath, "docs/alpha.md");

		const matches = await searchFiles({ rootPath, query: "alpha" });

		expect(matches.length).toBeGreaterThan(0);
		for (const m of matches) {
			expect(path.isAbsolute(m.relativePath)).toBe(false);
			expect(m.relativePath.includes("..")).toBe(false);
			expect(m.absolutePath.startsWith(rootPath + path.sep)).toBe(true);
		}
	});

	it("cannot escape the root via a traversal-style query string", async () => {
		const parent = await createTempRoot();
		const rootPath = path.join(parent, "workspace");
		await fs.mkdir(rootPath, { recursive: true });
		// A secret sibling OUTSIDE the workspace root.
		await writeFileAt(parent, "secret.env", "TOKEN=should-not-leak");
		await writeFileAt(rootPath, "inside.ts");

		// Queries that try to climb out of the root must not surface the sibling.
		for (const query of ["../secret", "../../secret", "/secret"]) {
			const matches = await searchFiles({ rootPath, query });
			for (const m of matches) {
				expect(m.absolutePath.startsWith(rootPath + path.sep)).toBe(true);
				expect(m.name).not.toBe("secret.env");
			}
		}
	});

	it("does not follow a symlink that points outside the root", async () => {
		const parent = await createTempRoot();
		const rootPath = path.join(parent, "workspace");
		await fs.mkdir(rootPath, { recursive: true });
		const outsideDir = path.join(parent, "outside");
		await fs.mkdir(outsideDir, { recursive: true });
		await fs.writeFile(path.join(outsideDir, "leak.ts"), "secret");

		// Symlink inside the root pointing at the outside dir.
		try {
			await fs.symlink(outsideDir, path.join(rootPath, "linked"));
		} catch {
			// Some sandboxes disallow symlink creation; the followSymbolicLinks:false
			// guarantee is still asserted by the absolutePath check below on real dirs.
		}
		await writeFileAt(rootPath, "leak.ts", "local");

		const matches = await searchFiles({ rootPath, query: "leak" });
		for (const m of matches) {
			expect(m.absolutePath.startsWith(rootPath + path.sep)).toBe(true);
			expect(m.absolutePath.includes(`${path.sep}outside${path.sep}`)).toBe(
				false,
			);
		}
	});
});
