import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

	it("skips markdown symlinks so imports cannot escape the vault", async () => {
		const vaultPath = await makeVault();
		const outsidePath = await mkdtemp(join(tmpdir(), "rox-obsidian-outside-"));
		tempDirs.push(outsidePath);
		await writeFile(join(outsidePath, "secret.md"), "SECRET", "utf8");
		await writeVaultFile(vaultPath, "safe.md", "SAFE");
		await symlink(join(outsidePath, "secret.md"), join(vaultPath, "leak.md"));

		const notes = await collectObsidianVaultNotes({ vaultPath });

		expect(notes).toEqual([{ path: "safe.md", content: "SAFE" }]);
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

	it("rejects batches larger than the cloud import mutation limit", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "a.md", "A");
		const { api, calls } = createMockApi();

		await expect(
			importObsidianVault({
				api,
				organizationId: "org-1",
				vaultPath,
				batchSize: 1001,
			}),
		).rejects.toThrow(/batchSize must be <= 1000/);
		expect(calls).toHaveLength(0);
	});

	it("retries transient import mutation failures", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "a.md", "A");
		let attempts = 0;
		const api = {
			integration: {
				obsidian: {
					importNotes: {
						mutate: async (input: ObsidianImportInput) => {
							attempts += 1;
							if (attempts === 1) {
								throw Object.assign(new Error("429 rate limit"), {
									status: 429,
								});
							}
							return { imported: input.notes.length };
						},
					},
				},
			},
		} satisfies ObsidianImportApi;

		const result = await importObsidianVault({
			api,
			organizationId: "org-1",
			vaultPath,
		});

		expect(result).toEqual({ scanned: 1, imported: 1, batches: 1 });
		expect(attempts).toBe(2);
	});

	it("stops before sending another batch when the import is aborted", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "a.md", "A");
		await writeVaultFile(vaultPath, "b.md", "B");
		const controller = new AbortController();
		const calls: ObsidianImportInput[] = [];
		const api = {
			integration: {
				obsidian: {
					importNotes: {
						mutate: async (input: ObsidianImportInput) => {
							calls.push(input);
							controller.abort();
							return { imported: input.notes.length };
						},
					},
				},
			},
		} satisfies ObsidianImportApi;

		await expect(
			importObsidianVault({
				api,
				organizationId: "org-1",
				vaultPath,
				batchSize: 1,
				signal: controller.signal,
			}),
		).rejects.toThrow(/aborted/);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.notes).toEqual([{ path: "a.md", content: "A" }]);
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

	it("deduplicates concurrent start calls", async () => {
		const vaultPath = await makeVault();
		await writeVaultFile(vaultPath, "Daily.md", "# Daily");
		const { api, calls } = createMockApi();

		const watcher = createObsidianVaultWatcher({
			api,
			organizationId: "org-1",
			vaultPath,
			debounceMs: 1,
		});

		const [first, second] = await Promise.all([
			watcher.start(),
			watcher.start(),
		]);
		watcher.stop();

		expect(first).toEqual({ scanned: 1, imported: 1, batches: 1 });
		expect(second).toEqual({ scanned: 1, imported: 1, batches: 1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({
			organizationId: "org-1",
			workspaceId: null,
			notes: [{ path: "Daily.md", content: "# Daily" }],
		});
	});
});
