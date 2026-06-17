import { type Dirent, type FSWatcher, watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_DEBOUNCE_MS = 750;
const MAX_NOTE_BYTES = 1_000_000;
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const IGNORED_DIRECTORIES = new Set([
	".git",
	".obsidian",
	"node_modules",
	"dist",
	"build",
	".trash",
]);

export interface ObsidianVaultNote {
	path: string;
	content: string;
}

export interface ObsidianImportInput {
	organizationId: string;
	workspaceId?: string | null;
	notes: ObsidianVaultNote[];
}

export interface ObsidianImportApi {
	integration: {
		obsidian: {
			importNotes: {
				mutate(input: ObsidianImportInput): Promise<{ imported: number }>;
			};
		};
	};
}

export interface CollectObsidianVaultNotesOptions {
	vaultPath: string;
	maxFiles?: number;
}

export interface ImportObsidianVaultOptions
	extends CollectObsidianVaultNotesOptions {
	api: ObsidianImportApi;
	organizationId: string;
	workspaceId?: string | null;
	batchSize?: number;
}

export interface ImportObsidianVaultResult {
	scanned: number;
	imported: number;
	batches: number;
}

export interface CreateObsidianVaultWatcherOptions
	extends ImportObsidianVaultOptions {
	debounceMs?: number;
	onError?: (error: unknown) => void;
}

export interface ObsidianVaultWatcher {
	start(): Promise<ImportObsidianVaultResult>;
	stop(): void;
	syncNow(): Promise<ImportObsidianVaultResult>;
}

function isMarkdownPath(path: string): boolean {
	const lower = path.toLowerCase();
	for (const extension of MARKDOWN_EXTENSIONS) {
		if (lower.endsWith(extension)) return true;
	}
	return false;
}

function normalizeVaultPath(root: string, absolutePath: string): string {
	return relative(root, absolutePath).split(sep).join("/");
}

function assertPositiveInteger(name: string, value: number): void {
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function sortByPath(notes: ObsidianVaultNote[]): ObsidianVaultNote[] {
	return notes.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectMarkdownFiles(
	root: string,
	currentDir: string,
	notes: ObsidianVaultNote[],
	maxFiles: number,
): Promise<void> {
	let entries: Dirent<string>[];
	try {
		entries = await readdir(currentDir, {
			encoding: "utf8",
			withFileTypes: true,
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}

	entries.sort((a, b) => a.name.localeCompare(b.name));

	for (const entry of entries) {
		const absolutePath = join(currentDir, entry.name);
		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name)) continue;
			await collectMarkdownFiles(root, absolutePath, notes, maxFiles);
			continue;
		}

		if (!entry.isFile() || !isMarkdownPath(entry.name)) continue;
		if (notes.length >= maxFiles) {
			throw new Error(
				`Obsidian vault import file limit exceeded (${maxFiles} markdown files)`,
			);
		}

		let fileStat: Awaited<ReturnType<typeof stat>>;
		try {
			fileStat = await stat(absolutePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}

		if (fileStat.size > MAX_NOTE_BYTES) continue;

		let content: string;
		try {
			content = await readFile(absolutePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}

		notes.push({
			path: normalizeVaultPath(root, absolutePath),
			content,
		});
	}
}

export async function collectObsidianVaultNotes(
	options: CollectObsidianVaultNotesOptions,
): Promise<ObsidianVaultNote[]> {
	const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
	assertPositiveInteger("maxFiles", maxFiles);

	const vaultPath = resolve(options.vaultPath);
	const rootStat = await stat(vaultPath);
	if (!rootStat.isDirectory()) {
		throw new Error(`Obsidian vault path is not a directory: ${vaultPath}`);
	}

	const notes: ObsidianVaultNote[] = [];
	await collectMarkdownFiles(vaultPath, vaultPath, notes, maxFiles);
	return sortByPath(notes);
}

function chunkNotes(
	notes: ObsidianVaultNote[],
	batchSize: number,
): ObsidianVaultNote[][] {
	const batches: ObsidianVaultNote[][] = [];
	for (let index = 0; index < notes.length; index += batchSize) {
		batches.push(notes.slice(index, index + batchSize));
	}
	return batches;
}

export async function importObsidianVault(
	options: ImportObsidianVaultOptions,
): Promise<ImportObsidianVaultResult> {
	const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
	assertPositiveInteger("batchSize", batchSize);

	const notes = await collectObsidianVaultNotes(options);
	const batches = chunkNotes(notes, batchSize);
	let imported = 0;

	for (const batch of batches) {
		const result = await options.api.integration.obsidian.importNotes.mutate({
			organizationId: options.organizationId,
			workspaceId: options.workspaceId ?? null,
			notes: batch,
		});
		imported += result.imported;
	}

	return {
		scanned: notes.length,
		imported,
		batches: batches.length,
	};
}

export function createObsidianVaultWatcher(
	options: CreateObsidianVaultWatcherOptions,
): ObsidianVaultWatcher {
	const vaultPath = resolve(options.vaultPath);
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	assertPositiveInteger("debounceMs", debounceMs);

	let watcher: FSWatcher | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let runningSync: Promise<ImportObsidianVaultResult> | null = null;

	const clearDebounce = () => {
		if (!debounceTimer) return;
		clearTimeout(debounceTimer);
		debounceTimer = null;
	};

	const syncNow = async () => {
		if (runningSync) return runningSync;
		runningSync = importObsidianVault({ ...options, vaultPath }).finally(() => {
			runningSync = null;
		});
		return runningSync;
	};

	const scheduleSync = (filename: string | Buffer | null) => {
		if (filename && !isMarkdownPath(String(filename))) return;
		clearDebounce();
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void syncNow().catch((error) => options.onError?.(error));
		}, debounceMs);
	};

	return {
		async start() {
			const result = await syncNow();
			if (watcher) return result;

			try {
				watcher = watch(vaultPath, { recursive: true }, (_event, filename) => {
					scheduleSync(filename);
				});
				watcher.on("error", (error) => {
					options.onError?.(error);
				});
			} catch (error) {
				// Recursive fs.watch is not available on every platform. Initial sync
				// still completed, and callers can surface the watch limitation.
				options.onError?.(error);
			}

			return result;
		},
		stop() {
			clearDebounce();
			watcher?.close();
			watcher = null;
		},
		syncNow,
	};
}

export function getObsidianVaultDisplayName(vaultPath: string): string {
	return basename(resolve(vaultPath));
}
