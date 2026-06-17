import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectObsidianVaultNotes,
	createObsidianVaultWatcher,
	importObsidianVault,
	type ObsidianImportApi,
	type ObsidianImportInput,
} from "./vault-import";

const tempDirs: string[] = [];

async function makeVault(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "rox-obsidian-vault-"));
	tempDirs.push(dir);
	return dir;
}

async function writeVaultFile(
	vaultPath: string,
	relativePath: string,
	content: string,
): Promise<void> {
	const filePath = join(vaultPath, ...relativePath.split("/"));
	await mkdir(join(filePath, ".."), { recursive: true });
	await writeFile(filePath, content, "utf8");
}

function createMockApi() {
	const calls: ObsidianImportInput[] = [];
	const api = {
		integration: {
			obsidian: {
				importNotes: {
					mutate: async (input: ObsidianImportInput) => {
						calls.push(input);
						return { imported: input.notes.length };
					},
				},
			},
		},
	} satisfies ObsidianImportApi;

	return { api, calls };
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("collectObsidianVaultNotes", () => {
	it("collects markdown notes and skips Obsidian metadata directories", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "Alpha.md", "# Alpha");
		await writeVaultFile(vaultPath, "Nested/Beta.markdown", "# Beta");
		await writeVaultFile(vaultPath, "Nested/Gamma.mdx", "# Gamma");
		await writeVaultFile(vaultPath, "README.txt", "ignore");
		await writeVaultFile(vaultPath, ".obsidian/workspace.md", "ignore");
		await writeVaultFile(vaultPath, "node_modules/pkg/index.md", "ignore");

		const notes = await collectObsidianVaultNotes({ vaultPath });

		expect(notes.map((note) => note.path)).toEqual([
			"Alpha.md",
			"Nested/Beta.markdown",
			"Nested/Gamma.mdx",
		]);
		expect(notes.map((note) => note.content)).toEqual([
			"# Alpha",
			"# Beta",
			"# Gamma",
		]);
	});

	it("bounds runaway vaults before reading unlimited markdown files", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "a.md", "A");
		await writeVaultFile(vaultPath, "b.md", "B");

		await expect(
			collectObsidianVaultNotes({ vaultPath, maxFiles: 1 }),
		).rejects.toThrow(/file limit exceeded/);
	});
});

describe("importObsidianVault", () => {
	it("imports collected notes through the cloud Obsidian import mutation in batches", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "a.md", "A");
		await writeVaultFile(vaultPath, "b.md", "B");
		await writeVaultFile(vaultPath, "c.md", "C");
		const { api, calls } = createMockApi();

		const result = await importObsidianVault({
			api,
			organizationId: "org-1",
			workspaceId: "workspace-1",
			vaultPath,
			batchSize: 2,
		});

		expect(result).toEqual({ scanned: 3, imported: 3, batches: 2 });
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual({
			organizationId: "org-1",
			workspaceId: "workspace-1",
			notes: [
				{ path: "a.md", content: "A" },
				{ path: "b.md", content: "B" },
			],
		});
		expect(calls[1]?.notes).toEqual([{ path: "c.md", content: "C" }]);
	});
});

describe("createObsidianVaultWatcher", () => {
	it("runs an initial import and exposes a stoppable watcher surface", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "Daily.md", "# Daily");
		const { api, calls } = createMockApi();

		const watcher = createObsidianVaultWatcher({
			api,
			organizationId: "org-1",
			vaultPath,
			debounceMs: 1,
		});

		const result = await watcher.start();
		watcher.stop();

		expect(result).toEqual({ scanned: 1, imported: 1, batches: 1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.workspaceId).toBeNull();
		expect(calls[0]?.notes).toEqual([{ path: "Daily.md", content: "# Daily" }]);
	});
});
