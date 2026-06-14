import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CatalogManifest,
	ensureCatalogInstalled,
} from "./preinstall-catalog";

const MANIFEST: CatalogManifest = {
	version: "catalog-test-1",
	skills: { count: 985, archive: "skills.tar.gz", sha256: "x", bytes: 1 },
	agents: { count: 111, archive: "agents.tar.gz", sha256: "y", bytes: 1 },
};

function tmp(): string {
	return mkdtempSync(join(tmpdir(), "rox-catalog-"));
}

describe("ensureCatalogInstalled", () => {
	it("skips when no manifest is bundled", async () => {
		const res = await ensureCatalogInstalled({
			resourcesDir: tmp(),
			homeDir: tmp(),
			readManifestFn: () => null,
		});
		expect(res.status).toBe("skipped");
	});

	it("installs into ~/.claude and writes the version marker", async () => {
		const home = tmp();
		const extracted: string[] = [];
		const res = await ensureCatalogInstalled({
			resourcesDir: tmp(),
			homeDir: home,
			readManifestFn: () => MANIFEST,
			extract: async (archive, dest) => {
				extracted.push(`${archive}->${dest}`);
			},
		});
		expect(res.status).toBe("installed");
		expect(res.skills).toBe(985);
		expect(res.agents).toBe(111);
		expect(extracted.length).toBe(2);
		const marker = join(home, ".claude", ".rox-catalog-version");
		expect(existsSync(marker)).toBe(true);
		expect(readFileSync(marker, "utf-8")).toBe("catalog-test-1");
	});

	it("is a no-op (up-to-date) when the marker already matches", async () => {
		const home = tmp();
		mkdirSync(join(home, ".claude"), { recursive: true });
		writeFileSync(
			join(home, ".claude", ".rox-catalog-version"),
			"catalog-test-1",
		);
		let calls = 0;
		const res = await ensureCatalogInstalled({
			resourcesDir: tmp(),
			homeDir: home,
			readManifestFn: () => MANIFEST,
			extract: async () => {
				calls++;
			},
		});
		expect(res.status).toBe("up-to-date");
		expect(calls).toBe(0);
	});

	it("re-installs when the bundled version changes", async () => {
		const home = tmp();
		mkdirSync(join(home, ".claude"), { recursive: true });
		writeFileSync(join(home, ".claude", ".rox-catalog-version"), "catalog-OLD");
		let calls = 0;
		const res = await ensureCatalogInstalled({
			resourcesDir: tmp(),
			homeDir: home,
			readManifestFn: () => MANIFEST,
			extract: async () => {
				calls++;
			},
		});
		expect(res.status).toBe("installed");
		expect(calls).toBe(2);
	});

	it("returns an error result instead of throwing on extractor failure", async () => {
		const res = await ensureCatalogInstalled({
			resourcesDir: tmp(),
			homeDir: tmp(),
			readManifestFn: () => MANIFEST,
			extract: async () => {
				throw new Error("boom");
			},
		});
		expect(res.status).toBe("error");
		expect(res.error).toContain("boom");
	});
});

describe("ensureCatalogInstalled (real tar extractor)", () => {
	function sha256(path: string): string {
		return createHash("sha256").update(readFileSync(path)).digest("hex");
	}

	it("extracts real archives, replaces a symlink, and preserves non-catalog entries", async () => {
		const home = tmp();
		const resources = tmp();
		const fixture = tmp();

		// Fixture trees: skills/demo-skill + agents/demo-agent.
		mkdirSync(join(fixture, "skills", "demo-skill"), { recursive: true });
		writeFileSync(join(fixture, "skills", "demo-skill", "SKILL.md"), "# demo");
		mkdirSync(join(fixture, "agents", "demo-agent"), { recursive: true });
		writeFileSync(join(fixture, "agents", "demo-agent", "AGENT.md"), "# agent");

		const skillsTar = join(resources, "skills.tar.gz");
		const agentsTar = join(resources, "agents.tar.gz");
		execFileSync("tar", ["-czf", skillsTar, "-C", fixture, "skills"]);
		execFileSync("tar", ["-czf", agentsTar, "-C", fixture, "agents"]);

		const manifest: CatalogManifest = {
			version: "catalog-real-1",
			skills: {
				count: 1,
				archive: "skills.tar.gz",
				sha256: sha256(skillsTar),
				bytes: 1,
			},
			agents: {
				count: 1,
				archive: "agents.tar.gz",
				sha256: sha256(agentsTar),
				bytes: 1,
			},
		};

		// Pre-seed ~/.claude/skills with a *symlink* where the catalog wants a
		// real dir, plus a user entry that must survive untouched.
		const claudeSkills = join(home, ".claude", "skills");
		mkdirSync(claudeSkills, { recursive: true });
		symlinkSync(tmp(), join(claudeSkills, "demo-skill"));
		mkdirSync(join(claudeSkills, "user-thing"), { recursive: true });
		writeFileSync(join(claudeSkills, "user-thing", "keep.md"), "keep");

		const res = await ensureCatalogInstalled({
			resourcesDir: resources,
			homeDir: home,
			readManifestFn: () => manifest,
		});

		expect(res.status).toBe("installed");
		// Symlink replaced by the real catalog dir + file.
		expect(
			readFileSync(join(claudeSkills, "demo-skill", "SKILL.md"), "utf-8"),
		).toBe("# demo");
		// Agent archive extracted too.
		expect(
			existsSync(join(home, ".claude", "agents", "demo-agent", "AGENT.md")),
		).toBe(true);
		// Non-catalog entry preserved.
		expect(
			readFileSync(join(claudeSkills, "user-thing", "keep.md"), "utf-8"),
		).toBe("keep");
		// Version marker written.
		expect(
			readFileSync(join(home, ".claude", ".rox-catalog-version"), "utf-8"),
		).toBe("catalog-real-1");
	});

	it("returns error on sha256 mismatch (tamper detection)", async () => {
		const home = tmp();
		const resources = tmp();
		writeFileSync(join(resources, "skills.tar.gz"), "not-a-real-archive");
		writeFileSync(join(resources, "agents.tar.gz"), "nope");
		const manifest: CatalogManifest = {
			version: "catalog-bad-1",
			skills: {
				count: 1,
				archive: "skills.tar.gz",
				sha256: "deadbeef",
				bytes: 1,
			},
			agents: {
				count: 1,
				archive: "agents.tar.gz",
				sha256: "deadbeef",
				bytes: 1,
			},
		};
		const res = await ensureCatalogInstalled({
			resourcesDir: resources,
			homeDir: home,
			readManifestFn: () => manifest,
		});
		expect(res.status).toBe("error");
		expect(res.error).toContain("sha256 mismatch");
	});
});
