import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@rox/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import { augmentPathForMacOS, getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);
const GIT_ENV_CACHE_TTL_MS = 60_000;
const GIT_ENV_PROBE_TIMEOUT_MS = 1_000;
const GIT_BINARY_CANDIDATES = [
	"/usr/bin/git",
	"/opt/homebrew/bin/git",
	"/usr/local/bin/git",
	"git",
];

interface GetGitProcessEnvOptions {
	forceRefresh?: boolean;
}

let cachedDefaultGitEnv: Record<string, string> | null = null;
let cachedDefaultGitEnvTime = 0;

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
const SIMPLE_GIT_OPTIONS = {
	...USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
	binary: resolveGitBinary(),
} satisfies Partial<SimpleGitOptions>;

function resolveGitBinary(): string {
	return (
		GIT_BINARY_CANDIDATES.find(
			(candidate) => candidate === "git" || existsSync(candidate),
		) ?? "git"
	);
}

function createUserSimpleGit(repoPath?: string): SimpleGit {
	return repoPath
		? simpleGit(repoPath, SIMPLE_GIT_OPTIONS)
		: simpleGit(SIMPLE_GIT_OPTIONS);
}

function copyStringEnv(
	baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(baseEnv)) {
		if (typeof value === "string") {
			env[key] = value;
		}
	}

	return env;
}

async function assertGitIsRunnable(env: Record<string, string>): Promise<void> {
	await execFileAsync("git", ["--version"], {
		encoding: "utf8",
		env,
		timeout: GIT_ENV_PROBE_TIMEOUT_MS,
	});
}

export async function getGitProcessEnv(
	baseEnv: NodeJS.ProcessEnv = process.env,
	options?: GetGitProcessEnvOptions,
): Promise<Record<string, string>> {
	const now = Date.now();
	const isDefaultEnv = baseEnv === process.env;
	if (
		isDefaultEnv &&
		!options?.forceRefresh &&
		cachedDefaultGitEnv &&
		now - cachedDefaultGitEnvTime < GIT_ENV_CACHE_TTL_MS
	) {
		return { ...cachedDefaultGitEnv };
	}

	const fastEnv = copyStringEnv(baseEnv);
	augmentPathForMacOS(fastEnv);

	try {
		await assertGitIsRunnable(fastEnv);
		if (isDefaultEnv) {
			cachedDefaultGitEnv = fastEnv;
			cachedDefaultGitEnvTime = now;
		}
		return { ...fastEnv };
	} catch {
		const shellEnv = await getProcessEnvWithShellPath(baseEnv, options);
		if (isDefaultEnv) {
			cachedDefaultGitEnv = shellEnv;
			cachedDefaultGitEnvTime = Date.now();
		}
		return shellEnv;
	}
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = createUserSimpleGit(repoPath);
	git.env(await getGitProcessEnv());
	return git;
}

export async function execGitWithShellPath(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	const env = await getGitProcessEnv(
		options?.env ? { ...process.env, ...options.env } : process.env,
	);

	return execFileAsync("git", args, {
		...options,
		encoding: "utf8",
		env,
	});
}
