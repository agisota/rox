import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
	bundledGitResourceSegments,
	type GitBinaryResolution,
	resolveGitBinaryFrom,
} from "@rox/shared/git-binary";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@rox/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Rox is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
const SIMPLE_GIT_OPTIONS =
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS satisfies Partial<SimpleGitOptions>;

function createUserSimpleGit(repoPath?: string, binary?: string): SimpleGit {
	const options: Partial<SimpleGitOptions> = binary
		? { ...SIMPLE_GIT_OPTIONS, binary }
		: SIMPLE_GIT_OPTIONS;
	return repoPath ? simpleGit(repoPath, options) : simpleGit(options);
}

/**
 * Bundled-git resolution (Ф2, #507). git must ALWAYS be available: prefer the
 * user's system git (resolved via the login-shell PATH, so their config and
 * credentials apply), and fall back to the portable git bundled into the app's
 * `extraResources` when no system git is present. The answer is stable for the
 * process lifetime, so it's probed once and cached.
 */
let cachedGitResolution: GitBinaryResolution | null = null;

/** Absolute path to the bundled portable git for this platform, if packaged. */
function bundledGitPath(): string | null {
	// `process.resourcesPath` is injected by Electron at runtime; it is absent in
	// dev / non-packaged contexts. Access it without depending on Electron's type
	// augmentation so this module typechecks in plain Node too.
	const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	if (!resourcesPath) return null;
	const candidate = join(resourcesPath, ...bundledGitResourceSegments());
	return existsSync(candidate) ? candidate : null;
}

/** Direct `git --version` probe (does not recurse through the resolver). */
async function probeSystemGit(): Promise<boolean> {
	try {
		const env = await getProcessEnvWithShellPath();
		await execFileAsync("git", ["--version"], {
			encoding: "utf8",
			env,
			timeout: 5000,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve which git binary every call site should use: the system git when
 * available, else the bundled git, else `"git"` (so a genuinely-missing git
 * surfaces a friendly preflight error rather than a raw spawn ENOENT). Cached.
 */
export async function resolveGitBinary(): Promise<GitBinaryResolution> {
	if (cachedGitResolution) return cachedGitResolution;
	const systemGitAvailable = await probeSystemGit();
	const resolution = resolveGitBinaryFrom({
		systemGitAvailable,
		// Only pay the `existsSync` when we actually need the bundled fallback.
		bundledGitPath: systemGitAvailable ? null : bundledGitPath(),
	});
	cachedGitResolution = resolution;
	return resolution;
}

/** Test seam / hot-path reset for the cached git-binary resolution. */
export function resetGitBinaryResolutionCache(): void {
	cachedGitResolution = null;
}

/**
 * Login-shell PATH env, with the bundled git's own bin dir prepended when the
 * bundled git is in use so its helper executables (git-remote-https, etc.)
 * resolve alongside it.
 */
async function gitEnvWithShellPath(
	resolution: GitBinaryResolution,
	baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
	const env = await getProcessEnvWithShellPath(baseEnv);
	if (resolution.source === "bundled") {
		const binDir = dirname(resolution.binary);
		const separator = process.platform === "win32" ? ";" : ":";
		const currentPath = env.PATH ?? env.Path ?? "";
		env.PATH = currentPath ? `${binDir}${separator}${currentPath}` : binDir;
		if ("Path" in env) env.Path = env.PATH;
	}
	return env;
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const resolution = await resolveGitBinary();
	const git = createUserSimpleGit(repoPath, resolution.binary);
	git.env(await gitEnvWithShellPath(resolution));
	return git;
}

/**
 * Friendly preflight for any flow that shells out to git (project create,
 * git init, clone). git is guaranteed by the bundle in a packaged build, but in
 * dev / unusual setups it may still be absent; without this check the failure
 * surfaces as a raw `spawn git ENOENT`, which is meaningless to a user.
 * Translate it into an actionable message.
 *
 * Throws on any non-ENOENT failure too — if `git --version` can't run we have
 * no business attempting the operation that follows.
 */
export async function assertGitAvailable(): Promise<void> {
	try {
		await execGitWithShellPath(["--version"]);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ENOENT") {
			throw new Error(
				"Git is not installed or could not be found in your PATH. Install Git, then try again.",
			);
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Git is not available: ${message}`);
	}
}

export async function execGitWithShellPath(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	const resolution = await resolveGitBinary();
	const baseEnv = options?.env
		? { ...process.env, ...options.env }
		: process.env;
	const env = await gitEnvWithShellPath(resolution, baseEnv);

	return execFileAsync(resolution.binary, args, {
		...options,
		encoding: "utf8",
		env,
	});
}
