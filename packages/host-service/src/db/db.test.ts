import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const migrateMock = mock(() => {
	throw new Error("migrate boom");
});

class FakeDatabase {
	readonly path: string;
	readonly pragma = mock(() => undefined);

	constructor(path: string) {
		this.path = path;
	}
}

mock.module("better-sqlite3", () => ({
	default: FakeDatabase,
}));

mock.module("drizzle-orm/better-sqlite3", () => ({
	drizzle: mock(() => ({ dialect: "fake-sqlite" })),
}));

mock.module("drizzle-orm/better-sqlite3/migrator", () => ({
	migrate: migrateMock,
}));

const { createDb } = await import("./db");

describe("createDb", () => {
	test("throws a contextual startup error when migrations cannot run", () => {
		const dir = mkdtempSync(join(tmpdir(), "host-db-migrate-"));
		const dbPath = join(dir, "host.db");
		const missingMigrations = join(dir, "missing-migrations");

		try {
			expect(() => createDb(dbPath, missingMigrations)).toThrow(
				"Failed to migrate host-service database",
			);
			expect(migrateMock).toHaveBeenCalledWith(
				{ dialect: "fake-sqlite" },
				{ migrationsFolder: missingMigrations },
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
