import { describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
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
