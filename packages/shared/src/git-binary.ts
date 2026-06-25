/**
 * Bundled-git resolution policy — the cross-platform core behind Ф2 (#507).
 *
 * git must ALWAYS be available so project/branch creation never fails on
 * "git not installed". The runtime prefers the user's own system git (resolved
 * via the login-shell PATH, so user config/credentials apply) and falls back to
 * a portable git bundled into the app's `extraResources`.
 *
 * This module is pure string logic (no Node / fs / path imports) so it is
 * unit-testable and reusable; the desktop main process does the actual
 * `existsSync` / `join` against `process.resourcesPath` using the segment
 * helpers here.
 */

/**
 * Directory name a platform/arch's portable git is bundled under, e.g.
 * `darwin-arm64`, `win32-x64`, `linux-x64`. Matches the layout produced by
 * `scripts/prepare-portable-git.ts` and wired into electron-builder
 * `extraResources`.
 */
export function bundledGitDirName(
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): string {
	return `${platform}-${arch}`;
}

/**
 * Path of the git executable *inside* a portable-git tree, relative to that
 * tree's root. PortableGit on Windows exposes `cmd/git.exe`; the macOS/Linux
 * tarballs expose `bin/git`.
 */
export function bundledGitRelativeExecPath(
	platform: NodeJS.Platform = process.platform,
): string {
	return platform === "win32" ? "cmd/git.exe" : "bin/git";
}

/**
 * Path segments (to be `join`-ed onto `process.resourcesPath` by the caller)
 * locating the bundled git executable for a platform/arch. Kept as segments so
 * this module avoids a `node:path` dependency and stays portable.
 */
export function bundledGitResourceSegments(
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): string[] {
	return [
		"resources",
		"git",
		bundledGitDirName(platform, arch),
		...bundledGitRelativeExecPath(platform).split("/"),
	];
}

/** Where the resolved git binary came from, for status display / logging. */
export type GitBinarySource = "system" | "bundled" | "fallback";

export interface GitBinaryResolution {
	/** The binary to spawn: `"git"` (PATH-resolved) or an absolute bundled path. */
	binary: string;
	source: GitBinarySource;
}

/**
 * Resolve which git binary to use given (a) whether the user's system git is
 * available on PATH and (b) the bundled git path if one is present:
 *
 *   1. system git on PATH        → `"git"`  (user config/credentials win)
 *   2. else a present bundled git → absolute bundled path
 *   3. else                       → `"git"` (let the spawn ENOENT surface a
 *                                   friendly preflight error)
 */
export function resolveGitBinaryFrom(opts: {
	systemGitAvailable: boolean;
	bundledGitPath: string | null;
}): GitBinaryResolution {
	if (opts.systemGitAvailable) return { binary: "git", source: "system" };
	if (opts.bundledGitPath) {
		return { binary: opts.bundledGitPath, source: "bundled" };
	}
	return { binary: "git", source: "fallback" };
}
