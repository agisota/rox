import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	createReadStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { logger } from "main/lib/logger";
import { ROX_DIR_NAME } from "shared/constants";

const execFileAsync = promisify(execFile);

/** Marker file (under ~/.claude) recording the installed catalog version. */
const VERSION_MARKER = ".rox-catalog-version";
const TOOL_VERSION_MARKER = ".rox-tool-version";
const ROX_HOME_DIR_ENV = "ROX_HOME_DIR";

type CatalogToolPackageManager = "npm" | "pip";

export interface CatalogToolManifest {
	id: string;
	packageManager: CatalogToolPackageManager;
	packageName: string;
	version: string;
	targetBinary: string;
	binaries: readonly string[];
	installCommand: string;
}

const PREINSTALL_TOOLS = [
	{
		id: "mgrep",
		packageManager: "npm",
		packageName: "@mixedbread/mgrep",
		version: "0.1.13",
		targetBinary: "mgrep",
		binaries: ["mgrep"],
		installCommand: "npm install -g @mixedbread/mgrep@0.1.13",
	},
	{
		id: "cli-anything",
		packageManager: "pip",
		packageName: "cli-anything-hub",
		version: "0.3.0",
		targetBinary: "cli-hub",
		binaries: ["cli-hub", "cli-anything"],
		installCommand: "python3 -m pip install cli-anything-hub==0.3.0",
	},
] as const satisfies readonly CatalogToolManifest[];

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
	tools?: number;
	error?: string;
}

interface RunCommandOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

type CommandRunner = (
	command: string,
	args: readonly string[],
	options?: RunCommandOptions,
) => Promise<void>;

export interface EnsureCatalogOptions {
	/** Directory holding manifest.json + the *.tar.gz archives (app resources). */
	resourcesDir: string;
	/** Home directory to install into; defaults to the OS home. */
	homeDir?: string;
	/** Rox home directory for tool shims + local package installs. */
	roxHomeDir?: string;
	/** Tool install catalog; defaults to Rox-managed agent CLI tools. */
	tools?: readonly CatalogToolManifest[];
	/** Injectable command runner for tests. */
	runCommand?: CommandRunner;
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

/**
 * Stream a file through SHA-256. Streaming (not `readFileSync`) keeps memory
 * flat and—crucially—yields the event loop, so verifying the bundled ~67 MB
 * archives never blocks the Electron main process on first launch.
 */
async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	await pipeline(createReadStream(path), hash);
	return hash.digest("hex");
}

/**
 * Extract a catalog archive into `~/.claude`, replacing each top-level entry
 * (an individual skill or subagent) so the bundled catalog wins over any
 * pre-existing copy — including when the destination is a **symlink** (a plain
 * `tar -xzf` into `~/.claude` refuses to "extract through symlink"). The user's
 * non-catalog entries are left untouched.
 *
 * Strategy: extract to a same-volume staging dir (no conflicts there), then
 * move each entry into place, removing any existing file/dir/symlink first.
 * `tar -xzf` (gzip) is universally available on macOS/Linux — no native dep.
 */
async function tarExtract(
	archivePath: string,
	claudeDir: string,
): Promise<void> {
	if (!existsSync(archivePath)) {
		throw new Error(`catalog archive missing: ${archivePath}`);
	}
	mkdirSync(claudeDir, { recursive: true });
	// Sweep staging dirs orphaned by a previously-killed run so they can't
	// accumulate inside ~/.claude.
	for (const entry of readdirSync(claudeDir)) {
		if (entry.startsWith(".rox-catalog-stage-")) {
			rmSync(join(claudeDir, entry), { recursive: true, force: true });
		}
	}
	// Stage inside ~/.claude so the final rename stays on the same volume.
	const stage = mkdtempSync(join(claudeDir, ".rox-catalog-stage-"));
	try {
		await execFileAsync("tar", ["-xzf", archivePath, "-C", stage]);
		// Path-traversal safety: only entries enumerated *under* the staging dir
		// are promoted into ~/.claude. A malicious archive escaping via `../` or
		// an absolute path (already neutralised by the sha256 pin on the bundled
		// archive) could never land an installed file outside ~/.claude.
		for (const top of readdirSync(stage)) {
			const srcTop = join(stage, top);
			if (!statSync(srcTop).isDirectory()) {
				logger.warn(
					`[preinstall-catalog] skipping unexpected top-level entry: ${top}`,
				);
				continue;
			}
			const destTop = join(claudeDir, top);
			mkdirSync(destTop, { recursive: true });
			for (const entry of readdirSync(srcTop)) {
				const dest = join(destTop, entry);
				rmSync(dest, { recursive: true, force: true });
				renameSync(join(srcTop, entry), dest);
			}
		}
	} finally {
		rmSync(stage, { recursive: true, force: true });
	}
}

async function runCommand(
	command: string,
	args: readonly string[],
	options: RunCommandOptions = {},
): Promise<void> {
	await execFileAsync(command, [...args], {
		cwd: options.cwd,
		env: options.env,
		maxBuffer: 20 * 1024 * 1024,
	});
}

function resolveRoxHomeDir(options: EnsureCatalogOptions): string {
	return (
		options.roxHomeDir ??
		process.env[ROX_HOME_DIR_ENV] ??
		join(options.homeDir ?? homedir(), ROX_DIR_NAME)
	);
}

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function writeExecutableIfChanged(filePath: string, content: string): boolean {
	const existing = existsSync(filePath)
		? readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			chmodSync(filePath, 0o755);
		} catch {
			// Best effort.
		}
		return false;
	}

	writeFileSync(filePath, content, { mode: 0o755 });
	try {
		chmodSync(filePath, 0o755);
	} catch {
		// Best effort.
	}
	return true;
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function getToolDir(roxHomeDir: string, tool: CatalogToolManifest): string {
	return join(roxHomeDir, "tools", tool.id);
}

function getToolTargetPath(toolDir: string, tool: CatalogToolManifest): string {
	if (tool.packageManager === "npm") {
		return join(toolDir, "node_modules", ".bin", tool.targetBinary);
	}

	return join(toolDir, "venv", "bin", tool.targetBinary);
}

function buildToolShim(targetPath: string): string {
	return `#!/bin/sh
# Rox preinstalled tool shim
exec ${quoteShellLiteral(targetPath)} "$@"
`;
}

async function installToolPackage(
	tool: CatalogToolManifest,
	toolDir: string,
	roxHomeDir: string,
	run: CommandRunner,
): Promise<void> {
	mkdirSync(toolDir, { recursive: true });
	if (tool.packageManager === "npm") {
		await run(
			"npm",
			[
				"install",
				"--prefix",
				toolDir,
				"--omit=dev",
				"--no-audit",
				"--no-fund",
				`${tool.packageName}@${tool.version}`,
			],
			{
				env: {
					...process.env,
					npm_config_cache: join(roxHomeDir, "cache", "npm"),
					npm_config_update_notifier: "false",
				},
			},
		);
		return;
	}

	const venvDir = join(toolDir, "venv");
	const venvPython = join(venvDir, "bin", "python");
	await run("python3", ["-m", "venv", venvDir]);
	await run(
		venvPython,
		[
			"-m",
			"pip",
			"install",
			"--disable-pip-version-check",
			"--upgrade",
			`${tool.packageName}==${tool.version}`,
		],
		{
			env: {
				...process.env,
				PIP_CACHE_DIR: join(roxHomeDir, "cache", "pip"),
				PIP_DISABLE_PIP_VERSION_CHECK: "1",
			},
		},
	);
}

async function ensureToolInstalled(
	tool: CatalogToolManifest,
	roxHomeDir: string,
	run: CommandRunner,
): Promise<"installed" | "up-to-date"> {
	const binDir = join(roxHomeDir, "bin");
	const toolDir = getToolDir(roxHomeDir, tool);
	const markerPath = join(toolDir, TOOL_VERSION_MARKER);
	const targetPath = getToolTargetPath(toolDir, tool);
	const current = existsSync(markerPath)
		? readFileSync(markerPath, "utf-8").trim()
		: null;

	const shimsArePresent = tool.binaries.every((binary) =>
		isFile(join(binDir, binary)),
	);
	if (current === tool.version && isFile(targetPath) && shimsArePresent) {
		return "up-to-date";
	}

	if (current !== tool.version || !isFile(targetPath)) {
		await installToolPackage(tool, toolDir, roxHomeDir, run);
		if (!isFile(targetPath)) {
			throw new Error(
				`tool install did not create ${tool.targetBinary}: ${tool.installCommand}`,
			);
		}
	}

	mkdirSync(binDir, { recursive: true });
	for (const binary of tool.binaries) {
		writeExecutableIfChanged(join(binDir, binary), buildToolShim(targetPath));
	}
	writeFileSync(markerPath, tool.version, "utf-8");
	return "installed";
}

async function ensurePreinstallToolsInstalled(
	options: EnsureCatalogOptions,
): Promise<{ installed: number; total: number }> {
	const tools = options.tools ?? PREINSTALL_TOOLS;
	if (tools.length === 0) {
		return { installed: 0, total: 0 };
	}

	const roxHomeDir = resolveRoxHomeDir(options);
	const run = options.runCommand ?? runCommand;
	let installed = 0;
	for (const tool of tools) {
		const result = await ensureToolInstalled(tool, roxHomeDir, run);
		if (result === "installed") {
			installed++;
		}
	}
	return { installed, total: tools.length };
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
		const toolsResult = await ensurePreinstallToolsInstalled(options);
		const readManifest = options.readManifestFn ?? readCatalogManifest;
		const manifest = readManifest(options.resourcesDir);
		if (!manifest) {
			return toolsResult.installed > 0
				? { status: "installed", tools: toolsResult.total }
				: { status: "skipped", tools: toolsResult.total };
		}

		const home = options.homeDir ?? homedir();
		const claudeDir = join(home, ".claude");
		const markerPath = join(claudeDir, VERSION_MARKER);

		const current = existsSync(markerPath)
			? readFileSync(markerPath, "utf-8").trim()
			: null;
		if (current === manifest.version) {
			return {
				status: toolsResult.installed > 0 ? "installed" : "up-to-date",
				version: manifest.version,
				skills: manifest.skills.count,
				agents: manifest.agents.count,
				tools: toolsResult.total,
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
				if ((await sha256File(archivePath)) !== part.sha256) {
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
			tools: toolsResult.total,
		};
	} catch (error) {
		return {
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
