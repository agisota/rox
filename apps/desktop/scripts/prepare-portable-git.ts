#!/usr/bin/env bun
/**
 * Stage a portable git per platform/arch into `resources/git/<platform>-<arch>/`
 * so electron-builder can bundle it (Ф2, #507). The runtime resolver
 * (`git-client.ts`) prefers the user's system git and only falls back to this
 * bundled copy when no system git is found — so this guarantees git is ALWAYS
 * available without requiring brew/admin/network on the end-user machine.
 *
 * Binaries are large and platform-specific, so they are fetched at package time
 * and never committed. electron-builder skips the bundle when this directory is
 * absent (see electron-builder.ts), so running this script is opt-in per build.
 *
 * Sources:
 *   - Windows: git-for-windows "MinGit" zip (official, self-contained). The
 *     executable lives at `cmd/git.exe`.
 *   - macOS / Linux: upstream publishes no canonical portable tarball, so point
 *     `ROX_PORTABLE_GIT_<PLATFORM>_<ARCH>_URL` at a vendored tarball whose root
 *     contains `bin/git` (e.g. a relocatable build you control). The script
 *     errors clearly rather than guessing a URL.
 *
 * Usage:
 *   bun apps/desktop/scripts/prepare-portable-git.ts            # current host
 *   bun apps/desktop/scripts/prepare-portable-git.ts --all      # every target
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	bundledGitDirName,
	bundledGitRelativeExecPath,
} from "@rox/shared/git-binary";

interface GitTarget {
	platform: NodeJS.Platform;
	arch: string;
}

interface ResolvedSource {
	url: string;
	/** "zip" | "tar" — how to extract the downloaded archive. */
	archive: "zip" | "tar";
}

const MINGIT_VERSION = "2.49.0";
const MINGIT_BASE = `https://github.com/git-for-windows/git/releases/download/v${MINGIT_VERSION}.windows.1`;

const TARGETS: GitTarget[] = [
	{ platform: "darwin", arch: "arm64" },
	{ platform: "darwin", arch: "x64" },
	{ platform: "win32", arch: "x64" },
	{ platform: "linux", arch: "x64" },
];

const DESKTOP_ROOT = resolve(import.meta.dir, "..");
const OUTPUT_ROOT = join(DESKTOP_ROOT, "resources", "git");

/** Resolve the archive URL for a target, honoring env overrides. */
function resolveSource(target: GitTarget): ResolvedSource {
	const envKey =
		`ROX_PORTABLE_GIT_${target.platform}_${target.arch}`.toUpperCase();
	const override = process.env[envKey];
	if (override) {
		return {
			url: override,
			archive: override.endsWith(".zip") ? "zip" : "tar",
		};
	}
	if (target.platform === "win32") {
		const bits = target.arch === "x64" ? "64" : "32";
		return {
			url: `${MINGIT_BASE}/MinGit-${MINGIT_VERSION}-${bits}-bit.zip`,
			archive: "zip",
		};
	}
	throw new Error(
		`No portable git source for ${target.platform}-${target.arch}. ` +
			`Set ${envKey} to a tarball whose root contains ${bundledGitRelativeExecPath(target.platform)}.`,
	);
}

async function download(url: string, dest: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Download failed (${response.status}): ${url}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	await Bun.write(dest, buffer);
}

function extract(archivePath: string, kind: "zip" | "tar", dest: string): void {
	mkdirSync(dest, { recursive: true });
	if (kind === "zip") {
		// `tar` on macOS/Windows 10+ and `unzip` on Linux both handle zip; prefer
		// the ubiquitous `unzip`, falling back to bsdtar.
		try {
			execFileSync("unzip", ["-q", "-o", archivePath, "-d", dest], {
				stdio: "inherit",
			});
		} catch {
			execFileSync("tar", ["-xf", archivePath, "-C", dest], {
				stdio: "inherit",
			});
		}
		return;
	}
	execFileSync("tar", ["-xf", archivePath, "-C", dest], { stdio: "inherit" });
}

async function prepareTarget(target: GitTarget): Promise<void> {
	const source = resolveSource(target);
	const outDir = join(
		OUTPUT_ROOT,
		bundledGitDirName(target.platform, target.arch),
	);
	const execPath = join(outDir, bundledGitRelativeExecPath(target.platform));

	if (existsSync(execPath)) {
		console.log(`✓ ${target.platform}-${target.arch}: already staged`);
		return;
	}

	const workDir = mkdtempSync(join(tmpdir(), "rox-portable-git-"));
	try {
		const archivePath = join(
			workDir,
			source.archive === "zip" ? "git.zip" : "git.tar",
		);
		console.log(`↓ ${target.platform}-${target.arch}: ${source.url}`);
		await download(source.url, archivePath);
		rmSync(outDir, { recursive: true, force: true });
		extract(archivePath, source.archive, outDir);
		if (!existsSync(execPath)) {
			throw new Error(
				`Extracted archive is missing ${bundledGitRelativeExecPath(target.platform)} at ${execPath}`,
			);
		}
		console.log(`✓ ${target.platform}-${target.arch}: staged at ${outDir}`);
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const all = process.argv.includes("--all");
	const targets = all
		? TARGETS
		: [{ platform: process.platform, arch: process.arch }];
	mkdirSync(OUTPUT_ROOT, { recursive: true });
	for (const target of targets) {
		await prepareTarget(target);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
