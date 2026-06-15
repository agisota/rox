import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROX_DIR_NAME } from "shared/constants";
import { getDefaultShell } from "../terminal/env";

/**
 * Finds all paths for a binary on Unix systems using the login shell.
 */
function findBinaryPathsUnix(name: string): string[] {
	const shell = getDefaultShell();
	const delimiter = "__ROX_WHICH_DELIMITER__";
	const result = execFileSync(
		shell,
		[
			"-il",
			"-c",
			`echo -n "${delimiter}"; which -a -- "$1"; echo -n "${delimiter}"`,
			"rox-find-binary",
			name,
		],
		{
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "ignore"],
		},
	);

	const sections = result.split(delimiter);
	const output = sections.length >= 3 ? sections[1] : result;

	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("/"))
		.filter(isExecutableUnixPath);
}

/**
 * Finds all paths for a binary on Windows using where.exe.
 */
function findBinaryPathsWindows(name: string): string[] {
	const result = execFileSync("where.exe", [name], {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "ignore"],
	});
	return result.trim().split("\r\n").filter(Boolean);
}

/**
 * Finds the real path of a binary, skipping our wrapper scripts.
 * Filters out all rox bin directories (prod, dev, and workspace-specific)
 * to avoid wrapper scripts calling each other.
 */
export function findRealBinary(name: string): string | null {
	try {
		const isWindows = process.platform === "win32";
		const allPaths = isWindows
			? findBinaryPathsWindows(name)
			: findBinaryPathsUnix(name);

		const homedir = os.homedir();
		// Filter out wrapper scripts from all rox home directories, both the new
		// visible names and the legacy dot-hidden ones:
		// - ~/rox/bin, ~/rox-*/bin (workspace-specific instances)
		// - ~/.rox/bin, ~/.rox-*/bin (legacy)
		const isRoxHomeDirName = (dirName: string): boolean =>
			dirName === ROX_DIR_NAME ||
			dirName === "rox" ||
			dirName === ".rox" ||
			dirName.startsWith("rox-") ||
			dirName.startsWith(".rox-");
		const isRoxWrapperPath = (p: string): boolean => {
			const relative = path.relative(homedir, path.normalize(p));
			if (
				relative === "" ||
				relative.startsWith("..") ||
				path.isAbsolute(relative)
			) {
				return false;
			}
			const [roxDirName, binDirName] = relative.split(/[\\/]+/);
			return binDirName === "bin" && isRoxHomeDirName(roxDirName ?? "");
		};
		const paths = allPaths.filter(
			(p) =>
				p && !isRoxWrapperPath(p) && (isWindows || isExecutableUnixPath(p)),
		);
		return paths[0] || null;
	} catch {
		return null;
	}
}

function isExecutableUnixPath(candidate: string): boolean {
	if (!path.isAbsolute(candidate) || !existsSync(candidate)) {
		return false;
	}

	try {
		const stat = statSync(candidate);
		if (!stat.isFile()) {
			return false;
		}
		accessSync(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
