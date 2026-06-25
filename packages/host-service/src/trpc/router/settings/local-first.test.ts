import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { hostSettings } from "../../../db/schema";
import {
	DEFAULT_AUTO_INIT_GIT,
	DEFAULT_LOCAL_FIRST_CREATE,
	getHostAutoInitGit,
	getHostLocalFirstCreate,
	getHostProjectsBaseDir,
	HOST_SETTINGS_ID,
} from "./host-settings";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("local-first host settings defaults", () => {
	it("localFirstCreate defaults OFF on a fresh row (safe default)", () => {
		const db = createTestDb();
		expect(getHostLocalFirstCreate(db)).toBe(false);
		expect(DEFAULT_LOCAL_FIRST_CREATE).toBe(false);
	});

	it("autoInitGit defaults ON (today's behavior)", () => {
		const db = createTestDb();
		expect(getHostAutoInitGit(db)).toBe(true);
		expect(DEFAULT_AUTO_INIT_GIT).toBe(true);
	});

	it("projectsBaseDir defaults to null (resolves to ~/rox at call site)", () => {
		const db = createTestDb();
		expect(getHostProjectsBaseDir(db)).toBeNull();
	});

	it("reads an explicit localFirstCreate=true override", () => {
		const db = createTestDb();
		db.insert(hostSettings)
			.values({ id: HOST_SETTINGS_ID, localFirstCreate: true })
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: { localFirstCreate: true },
			})
			.run();
		expect(getHostLocalFirstCreate(db)).toBe(true);
	});

	it("reads an explicit autoInitGit=false override", () => {
		const db = createTestDb();
		db.insert(hostSettings)
			.values({ id: HOST_SETTINGS_ID, autoInitGit: false })
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: { autoInitGit: false },
			})
			.run();
		expect(getHostAutoInitGit(db)).toBe(false);
	});
});
