import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@rox/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Rox is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
const SIMPLE_GIT_OPTIONS =
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS satisfies Partial<SimpleGitOptions>;

function createUserSimpleGit(repoPath?: string): SimpleGit {
	return repoPath
		? simpleGit(repoPath, SIMPLE_GIT_OPTIONS)
		: simpleGit(SIMPLE_GIT_OPTIONS);
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = createUserSimpleGit(repoPath);
	git.env(await getProcessEnvWithShellPath());
	return git;
}

/**
 * Friendly preflight for any flow that shells out to git (project create,
 * git init, clone). A freshly-set-up non-developer machine may not have git
 * installed at all; without this check the failure surfaces as a raw
 * `spawn git ENOENT`, which is meaningless to a user. Translate it into an
 * actionable message that points at the bootstrap installer.
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
	const env = await getProcessEnvWithShellPath(
		options?.env ? { ...process.env, ...options.env } : process.env,
	);

	return execFileAsync("git", args, {
		...options,
		encoding: "utf8",
		env,
	});
}
