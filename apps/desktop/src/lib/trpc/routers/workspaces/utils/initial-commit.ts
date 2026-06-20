import type { SimpleGit } from "simple-git";

/**
 * Per-repo fallback committer identity, applied ONLY when the user has no
 * global `user.name`/`user.email`. Passed as `-c key=value` overrides so it is
 * scoped to this single `git commit` and never mutates the user's global git
 * config. Keeps a no-git-identity non-developer from dead-ending on the initial
 * commit; once they configure a real identity, subsequent commits use it.
 */
export const FALLBACK_COMMIT_IDENTITY_ARGS = [
	"-c",
	"user.name=Rox",
	"-c",
	"user.email=rox@localhost",
] as const;

/** True when a failed commit is due to an unconfigured git identity. */
export function isMissingGitIdentityError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return (
		message.includes("empty ident") ||
		message.includes("user.email") ||
		message.includes("user.name")
	);
}

/**
 * Create the repo's initial commit, retrying with a commit-scoped Rox identity
 * when git has no configured `user.name`/`user.email`. `--no-verify` is always
 * passed so an inherited commit hook (e.g. from a global `core.hooksPath`)
 * can't block a freshly-onboarded user's very first commit.
 *
 * `git` must already be bound to the target repo path.
 */
export async function commitInitialWithIdentityFallback(
	git: SimpleGit,
): Promise<void> {
	const args = [
		"commit",
		"--allow-empty",
		"--no-verify",
		"-m",
		"Initial commit",
	];
	try {
		await git.raw(args);
	} catch (err) {
		if (!isMissingGitIdentityError(err)) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to create initial commit: ${message}`);
		}
		await git.raw([...FALLBACK_COMMIT_IDENTITY_ARGS, ...args]);
	}
}
