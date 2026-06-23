import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import {
	DEMO_PROJECT_COLOR,
	DEMO_PROJECT_DIR_NAME,
	DEMO_PROJECT_ICON_PATH,
	getDemoProjectPath,
	seedDemoProject,
} from "./demo-project";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

// Tests use bun:sqlite; production uses better-sqlite3. The drizzle adapters
// are structurally interchangeable for our purposes — cast as the host db type,
// mirroring the existing config-router test setup.
function createDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("seedDemoProject", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "demo-seed-test-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("seeds a demo project on first run", () => {
		const db = createDb();
		const result = seedDemoProject(db, home);

		expect(result.seeded).toBe(true);
		expect(result.repoPath).toBe(getDemoProjectPath(home));
		expect(result.repoPath).toContain(DEMO_PROJECT_DIR_NAME);

		const rows = db.select().from(schema.projects).all();
		expect(rows).toHaveLength(1);
	});

	it("is idempotent across repeated runs", () => {
		const db = createDb();
		const first = seedDemoProject(db, home);
		const second = seedDemoProject(db, home);

		expect(first.seeded).toBe(true);
		expect(second.seeded).toBe(false);
		expect(second.projectId).toBe(first.projectId);

		const rows = db.select().from(schema.projects).all();
		expect(rows).toHaveLength(1);
	});

	it("reuses and updates a legacy demo project row", () => {
		const db = createDb();
		const legacyRepoPath = join(
			home,
			".rox",
			"projects",
			DEMO_PROJECT_DIR_NAME,
		);
		const nextRepoPath = getDemoProjectPath(home);
		mkdirSync(legacyRepoPath, { recursive: true });
		db.insert(schema.projects)
			.values({
				id: "11111111-1111-1111-1111-111111111111",
				repoPath: legacyRepoPath,
			})
			.run();

		const result = seedDemoProject(db, home);

		expect(result.seeded).toBe(false);
		expect(result.projectId).toBe("11111111-1111-1111-1111-111111111111");
		expect(result.repoPath).toBe(nextRepoPath);
		expect(existsSync(nextRepoPath)).toBe(true);

		const rows = db.select().from(schema.projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.repoPath).toBe(nextRepoPath);
	});

	it("deduplicates existing current and legacy demo project rows", () => {
		const db = createDb();
		const legacyRepoPath = join(
			home,
			".rox",
			"projects",
			DEMO_PROJECT_DIR_NAME,
		);
		const nextRepoPath = getDemoProjectPath(home);
		mkdirSync(legacyRepoPath, { recursive: true });
		mkdirSync(nextRepoPath, { recursive: true });
		db.insert(schema.projects)
			.values([
				{
					id: "11111111-1111-1111-1111-111111111111",
					repoPath: legacyRepoPath,
				},
				{
					id: "22222222-2222-2222-2222-222222222222",
					repoPath: nextRepoPath,
				},
			])
			.run();

		const result = seedDemoProject(db, home);

		expect(result.seeded).toBe(false);
		expect(result.projectId).toBe("22222222-2222-2222-2222-222222222222");
		expect(result.repoPath).toBe(nextRepoPath);

		const rows = db.select().from(schema.projects).all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("22222222-2222-2222-2222-222222222222");
		expect(rows[0]?.repoPath).toBe(nextRepoPath);
	});
});

describe("demo project visual metadata (issue #26)", () => {
	it("is yellow", () => {
		// #facc15 is Tailwind yellow-400 — the demo project's display color the
		// renderer applies when it first surfaces the demo project.
		expect(DEMO_PROJECT_COLOR).toBe("#facc15");
	});

	it("uses the bundled pizdariki icon asset", () => {
		// Issue #26 names the asset `pizdariki.svg`; it ships in the desktop app's
		// resources dir (no external absolute path).
		expect(DEMO_PROJECT_ICON_PATH).toBe("icons/pizdariki.svg");
	});

	it("ships the pizdariki icon asset in the desktop resources dir", () => {
		// Guard against the constant pointing at a missing file. Resolve the asset
		// relative to the repo's desktop resources dir.
		const assetPath = resolve(
			import.meta.dir,
			"../../../../../apps/desktop/resources",
			DEMO_PROJECT_ICON_PATH,
		);
		expect(existsSync(assetPath)).toBe(true);
	});
});
