import { existsSync } from "node:fs";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@rox/shared/simple-git-options";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";
import { buildMinimalEnv } from "../../terminal/clean-shell-env";

const GIT_BINARY_CANDIDATES = [
	"/usr/bin/git",
	"/opt/homebrew/bin/git",
	"/usr/local/bin/git",
	"git",
];

// Rox is a local Git client, so inherited user Git config/env is expected
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

export function createUserSimpleGit(baseDir?: string): SimpleGit {
	const git = baseDir
		? simpleGit(baseDir, SIMPLE_GIT_OPTIONS)
		: simpleGit(SIMPLE_GIT_OPTIONS);
	git.env(buildMinimalEnv());
	return git;
}
