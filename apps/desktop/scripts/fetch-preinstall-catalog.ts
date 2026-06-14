#!/usr/bin/env bun
/**
 * Fetch the preinstall catalog archives (skills + subagents) from the pinned
 * GitHub release into apps/desktop/resources/preinstall/ so electron-builder
 * can bundle them via `extraResources`. Run automatically by the desktop
 * `prebuild` step; safe to run by hand.
 *
 * Idempotent: an archive already present with a matching sha256 is left alone
 * (so local builds don't re-download). The big *.tar.gz files are gitignored;
 * only manifest.json is committed, and it pins the release tag + checksums.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "agisota/set";
const dir = join(import.meta.dirname, "..", "resources", "preinstall");
const manifestPath = join(dir, "manifest.json");

if (!existsSync(manifestPath)) {
	console.error(`[fetch:catalog] manifest not found: ${manifestPath}`);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
	version: string;
	skills: { archive: string; sha256: string };
	agents: { archive: string; sha256: string };
};

const tag = manifest.version;

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const part of [manifest.skills, manifest.agents]) {
	const dest = join(dir, part.archive);
	if (existsSync(dest) && sha256(dest) === part.sha256) {
		console.log(`[fetch:catalog] ✓ ${part.archive} present and verified`);
		continue;
	}
	console.log(
		`[fetch:catalog] downloading ${part.archive} from ${REPO}@${tag}…`,
	);
	try {
		await Bun.$`gh release download ${tag} --repo ${REPO} --pattern ${part.archive} --dir ${dir} --clobber`;
	} catch (error) {
		// Fail-soft: a build environment without an authenticated `gh`
		// (e.g. the generic CI build job, which doesn't ship the .app) just
		// builds without the bundled catalog. The shipping build-desktop
		// workflow sets GH_TOKEN, and local builds use the staged archives.
		console.warn(
			`[fetch:catalog] ⚠ could not download ${part.archive}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		console.warn(
			"[fetch:catalog] continuing without bundled catalog (set GH_TOKEN for an authenticated download).",
		);
		continue;
	}
	if (!existsSync(dest)) {
		// `gh` exited 0 but produced no file (e.g. pattern matched nothing) —
		// treat as a hard failure rather than crashing on the sha256 read.
		console.error(
			`[fetch:catalog] ${part.archive} missing after a successful download`,
		);
		process.exit(1);
	}
	const got = sha256(dest);
	if (got !== part.sha256) {
		console.error(
			`[fetch:catalog] sha256 mismatch for ${part.archive}: ${got} != ${part.sha256}`,
		);
		process.exit(1);
	}
	console.log(`[fetch:catalog] ✓ ${part.archive} downloaded and verified`);
}

console.log("[fetch:catalog] catalog ready");
