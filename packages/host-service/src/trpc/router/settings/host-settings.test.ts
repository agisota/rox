import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { hostSettings } from "../../../db/schema";
import {
	DEFAULT_BRANCH_PREFIX_CUSTOM,
	DEFAULT_BRANCH_PREFIX_MODE,
	ensureHostSettingsRow,
	HOST_SETTINGS_ID,
} from "./host-settings";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("ensureHostSettingsRow", () => {
	it("seeds the rox branch-prefix default on first run", () => {
		const db = createTestDb();
		const row = ensureHostSettingsRow(db);

		expect(row.id).toBe(HOST_SETTINGS_ID);
		expect(row.branchPrefixMode).toBe(DEFAULT_BRANCH_PREFIX_MODE);
		expect(row.branchPrefixCustom).toBe(DEFAULT_BRANCH_PREFIX_CUSTOM);
		expect(DEFAULT_BRANCH_PREFIX_CUSTOM).toBe("rox");
		// New installs have no explicit worktree base dir (resolves to default).
		expect(row.worktreeBaseDir).toBeNull();
	});

	it("never mutates an existing row (upgraders keep their settings)", () => {
		const db = createTestDb();
		// Simulate an upgraded host whose row predates the rox default.
		db.insert(hostSettings)
			.values({
				id: HOST_SETTINGS_ID,
				worktreeBaseDir: null,
				branchPrefixMode: null,
				branchPrefixCustom: null,
			})
			.run();

		const row = ensureHostSettingsRow(db);
		expect(row.branchPrefixMode).toBeNull();
		expect(row.branchPrefixCustom).toBeNull();
	});

	it("is idempotent across repeated calls", () => {
		const db = createTestDb();
		ensureHostSettingsRow(db);
		ensureHostSettingsRow(db);

		const rows = db
			.select()
			.from(hostSettings)
			.where(eq(hostSettings.id, HOST_SETTINGS_ID))
			.all();
		expect(rows).toHaveLength(1);
	});
});
