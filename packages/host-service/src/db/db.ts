import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { logger } from "../lib/logger";
import * as schema from "./schema.ts";

export type HostDb = ReturnType<typeof createDb>;

export function createDb(dbPath: string, migrationsFolder: string) {
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	logger.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	try {
		migrate(db, { migrationsFolder });
	} catch (error) {
		logger.error("[host-service:db] Migration failed:", error);
		throw new Error(
			`Failed to migrate host-service database at ${dbPath} using migrations from ${migrationsFolder}`,
			{ cause: error },
		);
	}

	return db;
}
