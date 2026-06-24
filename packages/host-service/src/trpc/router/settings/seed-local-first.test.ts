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
	DEFAULT_LOCAL_FIRST_CREATE,
	getHostLocalFirstCreate,
	HOST_SETTINGS_ID,
	seedLocalFirstCreateDefault,
} from "./host-settings";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

/** Read the raw nullable column (null = never chosen) without getter coalescing. */
function rawLocalFirstCreate(db: HostDb): boolean | null {
	return (
		db
			.select()
			.from(hostSettings)
			.where(eq(hostSettings.id, HOST_SETTINGS_ID))
			.get()?.localFirstCreate ?? null
	);
}

describe("seedLocalFirstCreateDefault (enable-by-default startup seed)", () => {
	it("(a) first launch with no prior setting → seed enables; getter reads ON", () => {
		const db = createTestDb();

		// Precondition: nothing seeded yet → getter resolves the safe OFF default.
		expect(getHostLocalFirstCreate(db)).toBe(false);

		// The startup seed runs once.
		const wrote = seedLocalFirstCreateDefault(db);
		expect(wrote).toBe(true);

		// After the seed, a real build reads ON.
		expect(getHostLocalFirstCreate(db)).toBe(true);
		// And the column now holds an explicit `true`, not null.
		expect(rawLocalFirstCreate(db)).toBe(true);
	});

	it("(b) an explicit user OFF is NOT re-enabled by the seed (kill-switch survives)", () => {
		const db = createTestDb();

		// User flips the kill-switch (mirrors `settings.localFirstCreate.set false`).
		db.insert(hostSettings)
			.values({ id: HOST_SETTINGS_ID, localFirstCreate: false })
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: { localFirstCreate: false },
			})
			.run();
		expect(getHostLocalFirstCreate(db)).toBe(false);

		// Startup seed must treat explicit-false as a real choice → no write.
		const wrote = seedLocalFirstCreateDefault(db);
		expect(wrote).toBe(false);

		// OFF persists; column is still an explicit `false`, never flipped to true.
		expect(getHostLocalFirstCreate(db)).toBe(false);
		expect(rawLocalFirstCreate(db)).toBe(false);
	});

	it("(c) an explicit user ON stays ON (seed is a no-op on a non-null column)", () => {
		const db = createTestDb();

		db.insert(hostSettings)
			.values({ id: HOST_SETTINGS_ID, localFirstCreate: true })
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: { localFirstCreate: true },
			})
			.run();

		const wrote = seedLocalFirstCreateDefault(db);
		expect(wrote).toBe(false);
		expect(getHostLocalFirstCreate(db)).toBe(true);
	});

	it("is idempotent: a second startup seed never re-writes after the first", () => {
		const db = createTestDb();

		expect(seedLocalFirstCreateDefault(db)).toBe(true); // first launch writes
		expect(seedLocalFirstCreateDefault(db)).toBe(false); // restart: no-op
		expect(seedLocalFirstCreateDefault(db)).toBe(false); // and again
		expect(getHostLocalFirstCreate(db)).toBe(true);
	});

	it("keeps the schema/getter DEFAULT OFF when the seed never runs (regression baseline)", () => {
		const db = createTestDb();

		// Without the startup seed, a fresh row stays null → OFF, exactly as the
		// existing regression tests rely on. The seed only changes behavior when
		// `createApp` invokes it on real startup.
		expect(getHostLocalFirstCreate(db)).toBe(false);
		expect(DEFAULT_LOCAL_FIRST_CREATE).toBe(false);
		expect(rawLocalFirstCreate(db)).toBeNull();
	});
});
