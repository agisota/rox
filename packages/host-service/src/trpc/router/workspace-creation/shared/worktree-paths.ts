import { homedir } from "node:os";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

// Kept outside the primary checkout so editors, file watchers, and
// ignore rules treat worktrees as separate trees, not nested ones.
//
// New installs default to `~/rox/worktrees` (a visible, top-level folder).
// Upgraders are unaffected: an existing `host_settings.worktreeBaseDir` is
// preserved verbatim, and a `null` value only resolves to this default at
// read time (see `getHostWorktreeBaseDir`). Anyone who explicitly set the
// previous default (`~/.rox/worktrees`) keeps it.
export function defaultWorktreesRoot(): string {
	return join(homedir(), "rox", "worktrees");
}

// Default root new projects are created under. Mirrors `defaultWorktreesRoot`:
// a visible, top-level `~/rox` folder. A null `host_settings.projectsBaseDir`
// resolves to this at read time (see `getHostProjectsBaseDir`), so upgraders
// who never set it keep the historical `~/rox/projects` parent (the create
// path joins `projects` onto this root).
export function defaultProjectsRoot(): string {
	return join(homedir(), "rox");
}

export function normalizeWorktreeBaseDir(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("~")) {
		const rest = trimmed.slice(1);
		if (rest === "" || rest.startsWith("/") || rest.startsWith("\\")) {
			return normalize(join(homedir(), rest));
		}
	}

	if (!isAbsolute(trimmed)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Worktree location must be an absolute path or start with ~",
		});
	}

	return resolve(trimmed);
}

export function projectWorktreesRoot(
	projectId: string,
	worktreeBaseDir?: string | null,
): string {
	return resolve(worktreeBaseDir ?? defaultWorktreesRoot(), projectId);
}

export function safeResolveWorktreePath(
	projectId: string,
	branchName: string,
	worktreeBaseDir?: string | null,
): string {
	const projectRoot = projectWorktreesRoot(projectId, worktreeBaseDir);
	const worktreePath = resolve(projectRoot, branchName);
	if (
		worktreePath !== projectRoot &&
		!worktreePath.startsWith(projectRoot + sep)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid branch name: path traversal detected (${branchName})`,
		});
	}
	return worktreePath;
}
