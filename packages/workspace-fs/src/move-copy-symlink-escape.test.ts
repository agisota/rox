import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyPath, movePath, WorkspaceFsPathError } from "./fs";

const tempDirs: string[] = [];

async function mkTemp(prefix: string): Promise<string> {
	const created = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const real = await fs.realpath(created);
	tempDirs.push(real);
	return real;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

async function expectSymlinkEscape(fn: () => Promise<unknown>): Promise<void> {
	let code: string | undefined;
	try {
		await fn();
	} catch (error) {
		if (!(error instanceof WorkspaceFsPathError)) throw error;
		code = error.code;
	}
	expect(code).toBe("SYMLINK_ESCAPE");
}

async function exists(target: string): Promise<boolean> {
	return fs.access(target).then(
		() => true,
		() => false,
	);
}

describe("movePath / copyPath symlink containment", () => {
	it("moves a file within the workspace", async () => {
		const root = await mkTemp("wfs-move-ok-");
		await fs.writeFile(path.join(root, "a.txt"), "hi");
		await fs.mkdir(path.join(root, "sub"));

		await movePath({
			rootPath: root,
			sourceAbsolutePath: path.join(root, "a.txt"),
			destinationAbsolutePath: path.join(root, "sub", "b.txt"),
		});

		expect(await fs.readFile(path.join(root, "sub", "b.txt"), "utf-8")).toBe(
			"hi",
		);
		expect(await exists(path.join(root, "a.txt"))).toBe(false);
	});

	it("copies a file within the workspace", async () => {
		const root = await mkTemp("wfs-copy-ok-");
		await fs.writeFile(path.join(root, "a.txt"), "hi");

		await copyPath({
			rootPath: root,
			sourceAbsolutePath: path.join(root, "a.txt"),
			destinationAbsolutePath: path.join(root, "b.txt"),
		});

		expect(await fs.readFile(path.join(root, "b.txt"), "utf-8")).toBe("hi");
	});

	it("blocks move whose destination escapes via a symlinked ancestor", async () => {
		const root = await mkTemp("wfs-move-escape-root-");
		const outside = await mkTemp("wfs-move-escape-outside-");
		await fs.symlink(outside, path.join(root, "link"));
		await fs.writeFile(path.join(root, "secret.txt"), "secret");

		await expectSymlinkEscape(() =>
			movePath({
				rootPath: root,
				sourceAbsolutePath: path.join(root, "secret.txt"),
				destinationAbsolutePath: path.join(root, "link", "exfil.txt"),
			}),
		);

		expect(await exists(path.join(outside, "exfil.txt"))).toBe(false);
		expect(await fs.readFile(path.join(root, "secret.txt"), "utf-8")).toBe(
			"secret",
		);
	});

	it("blocks copy whose destination escapes via a symlinked ancestor", async () => {
		const root = await mkTemp("wfs-copy-escape-root-");
		const outside = await mkTemp("wfs-copy-escape-outside-");
		await fs.symlink(outside, path.join(root, "link"));
		await fs.writeFile(path.join(root, "secret.txt"), "secret");

		await expectSymlinkEscape(() =>
			copyPath({
				rootPath: root,
				sourceAbsolutePath: path.join(root, "secret.txt"),
				destinationAbsolutePath: path.join(root, "link", "exfil.txt"),
			}),
		);

		expect(await exists(path.join(outside, "exfil.txt"))).toBe(false);
	});

	it("blocks move whose source escapes via a symlinked ancestor", async () => {
		const root = await mkTemp("wfs-move-src-escape-root-");
		const outside = await mkTemp("wfs-move-src-escape-outside-");
		await fs.writeFile(path.join(outside, "external.txt"), "external");
		await fs.symlink(outside, path.join(root, "link"));

		await expectSymlinkEscape(() =>
			movePath({
				rootPath: root,
				sourceAbsolutePath: path.join(root, "link", "external.txt"),
				destinationAbsolutePath: path.join(root, "pulled.txt"),
			}),
		);

		expect(await fs.readFile(path.join(outside, "external.txt"), "utf-8")).toBe(
			"external",
		);
	});

	it("blocks copy whose destination IS a symlink entry escaping the root (dangling)", async () => {
		const root = await mkTemp("wfs-copy-dest-entry-root-");
		const outside = await mkTemp("wfs-copy-dest-entry-outside-");
		await fs.writeFile(path.join(root, "secret.txt"), "secret");
		// Destination is a symlink directly in root whose target is outside.
		// fs.cp (under Bun) dereferences it, so the parent-only check is not enough.
		await fs.symlink(path.join(outside, "exfil.txt"), path.join(root, "dlink"));

		await expectSymlinkEscape(() =>
			copyPath({
				rootPath: root,
				sourceAbsolutePath: path.join(root, "secret.txt"),
				destinationAbsolutePath: path.join(root, "dlink"),
			}),
		);

		expect(await exists(path.join(outside, "exfil.txt"))).toBe(false);
	});

	it("blocks copy whose destination symlink targets an existing outside file (no overwrite)", async () => {
		const root = await mkTemp("wfs-copy-dest-overwrite-root-");
		const outside = await mkTemp("wfs-copy-dest-overwrite-outside-");
		await fs.writeFile(path.join(root, "secret.txt"), "secret");
		await fs.writeFile(path.join(outside, "victim.txt"), "victim");
		await fs.symlink(
			path.join(outside, "victim.txt"),
			path.join(root, "dlink"),
		);

		await expectSymlinkEscape(() =>
			copyPath({
				rootPath: root,
				sourceAbsolutePath: path.join(root, "secret.txt"),
				destinationAbsolutePath: path.join(root, "dlink"),
			}),
		);

		expect(await fs.readFile(path.join(outside, "victim.txt"), "utf-8")).toBe(
			"victim",
		);
	});
});
