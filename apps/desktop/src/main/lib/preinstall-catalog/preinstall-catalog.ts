import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Marker file (under ~/.claude) recording the installed catalog version. */
const VERSION_MARKER = ".rox-catalog-version";

export interface CatalogPartManifest {
	count: number;
	archive: string;
	sha256: string;
	bytes: number;
}

export interface CatalogManifest {
	version: string;
	skills: CatalogPartManifest;
	agents: CatalogPartManifest;
}

export type EnsureCatalogStatus =
	| "installed"
	| "up-to-date"
	| "skipped"
	| "error";

export interface EnsureCatalogResult {
	status: EnsureCatalogStatus;
	version?: string;
	skills?: number;
	agents?: number;
	error?: string;
}

export interface EnsureCatalogOptions {
	/** Directory holding manifest.json + the *.tar.gz archives (app resources). */
	resourcesDir: string;
	/** Home directory to install into; defaults to the OS home. */
	homeDir?: string;
	/** Injectable extractor (archivePath, destDir); defaults to `tar -xzf`. */
	extract?: (archivePath: string, destDir: string) => Promise<void>;
	/** Injectable manifest reader for tests. */
	readManifestFn?: (resourcesDir: string) => CatalogManifest | null;
}

/**
 * Read the bundled catalog manifest. Returns null when absent or unparseable
 * (e.g. a dev build where the archives were never fetched) so the caller can
 * silently skip — a missing catalog must never break app startup.
 */
export function readCatalogManifest(
	resourcesDir: string,
): CatalogManifest | null {
	const path = join(resourcesDir, "manifest.json");
	if (!existsSync(path)) {
		return null;
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as CatalogManifest;
		if (
			!parsed?.version ||
			!parsed.skills?.archive ||
			!parsed.agents?.archive
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function sha256File(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function tarExtract(archivePath: string, destDir: string): Promise<void> {
	if (!existsSync(archivePath)) {
		throw new Error(`catalog archive missing: ${archivePath}`);
	}
	// `tar -xzf` (gzip) is universally available on macOS/Linux — no native dep.
	await execFileAsync("tar", ["-xzf", archivePath, "-C", destDir]);
}

/**
 * Idempotently install the bundled skill + subagent catalog into the user's
 * global Claude directory (`~/.claude/skills`, `~/.claude/agents`) so every
 * workspace's agents have the full catalog out-of-the-box.
 *
 * Versioned via a marker file: re-running with the same catalog version is a
 * no-op. Robust by design — any failure returns an `error` result instead of
 * throwing, because this runs on the app-startup path and must never block it.
 */
export async function ensureCatalogInstalled(
	options: EnsureCatalogOptions,
): Promise<EnsureCatalogResult> {
	try {
		const readManifest = options.readManifestFn ?? readCatalogManifest;
		const manifest = readManifest(options.resourcesDir);
		if (!manifest) {
			return { status: "skipped" };
		}

		const home = options.homeDir ?? homedir();
		const claudeDir = join(home, ".claude");
		const markerPath = join(claudeDir, VERSION_MARKER);

		const current = existsSync(markerPath)
			? readFileSync(markerPath, "utf-8").trim()
			: null;
		if (current === manifest.version) {
			return {
				status: "up-to-date",
				version: manifest.version,
				skills: manifest.skills.count,
				agents: manifest.agents.count,
			};
		}

		const extract = options.extract ?? tarExtract;

		// When using the real extractor, verify the bundled archives. A build
		// that shipped without them (e.g. a generic CI build where the catalog
		// download was skipped) has nothing to install — skip rather than error.
		if (!options.extract) {
			for (const part of [manifest.skills, manifest.agents]) {
				const archivePath = join(options.resourcesDir, part.archive);
				if (!existsSync(archivePath)) {
					return { status: "skipped" };
				}
				if (sha256File(archivePath) !== part.sha256) {
					return {
						status: "error",
						error: `sha256 mismatch for ${part.archive}`,
					};
				}
			}
		}

		mkdirSync(claudeDir, { recursive: true });

		await extract(
			join(options.resourcesDir, manifest.skills.archive),
			claudeDir,
		);
		await extract(
			join(options.resourcesDir, manifest.agents.archive),
			claudeDir,
		);

		writeFileSync(markerPath, manifest.version, "utf-8");
		return {
			status: "installed",
			version: manifest.version,
			skills: manifest.skills.count,
			agents: manifest.agents.count,
		};
	} catch (error) {
		return {
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
