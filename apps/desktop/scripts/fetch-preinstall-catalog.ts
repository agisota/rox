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
	await Bun.$`gh release download ${tag} --repo ${REPO} --pattern ${part.archive} --dir ${dir} --clobber`;
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
