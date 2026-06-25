import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { savedPrompts } from "@rox/local-db/schema/schema";
import { eq } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import type { LocalDb } from "main/lib/local-db";
import {
	__resetBackfillGuardForTests,
	backfillSavedPromptMetadata,
} from "./backfill";

/**
 * Integration coverage for the legacy `rox:meta` → columns backfill against a
 * throwaway in-memory SQLite DB. The bun-sqlite drizzle handle is structurally
 * compatible with the better-sqlite3 `LocalDb` the backfill expects, so we cast
 * it for the call.
 */

const DDL = `
CREATE TABLE saved_prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  folder TEXT,
  tags TEXT DEFAULT '[]',
  is_favorite INTEGER DEFAULT false NOT NULL,
  copy_count INTEGER DEFAULT 0 NOT NULL,
  last_used_at INTEGER,
  position INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

let sqlite: Database;
let db: BunSQLiteDatabase<Record<string, never>>;

beforeEach(() => {
	__resetBackfillGuardForTests();
	sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	db = drizzle(sqlite);
});

afterEach(() => {
	sqlite.close();
});

function asLocalDb(): LocalDb {
	return db as unknown as LocalDb;
}

describe("backfillSavedPromptMetadata", () => {
	test("migrates a legacy rox:meta block into real columns and cleans body", () => {
		sqlite.exec(
			`INSERT INTO saved_prompts (id, title, body, created_at, updated_at)
			 VALUES ('p1', 'T', 'Hello {{name}}' || char(10) || char(10) ||
			   '<!--rox:meta {"tags":["x","y"],"favorite":true,"useCount":4,"lastUsedAt":99} -->',
			   1000, 2000);`,
		);

		backfillSavedPromptMetadata(asLocalDb());

		const [row] = db
			.select()
			.from(savedPrompts)
			.where(eq(savedPrompts.id, "p1"))
			.all();
		expect(row?.body).toBe("Hello {{name}}");
		expect(row?.body.includes("rox:meta")).toBe(false);
		expect(row?.tags).toEqual(["x", "y"]);
		expect(row?.isFavorite).toBe(true);
		expect(row?.copyCount).toBe(4);
		expect(row?.lastUsedAt).toBe(99);
		expect(row?.position).toBe(0);
	});

	test("assigns a position to rows that lack one without touching clean bodies", () => {
		sqlite.exec(
			`INSERT INTO saved_prompts (id, title, body, is_favorite, created_at, updated_at)
			 VALUES ('a', 'A', 'plain a', 0, 1, 10),
			        ('b', 'B', 'plain b', 1, 1, 20);`,
		);

		backfillSavedPromptMetadata(asLocalDb());

		const rows = db.select().from(savedPrompts).all();
		const byId = new Map(rows.map((r) => [r.id, r]));
		// Favorite ('b') sorts first → position 0; bodies stay untouched.
		expect(byId.get("b")?.position).toBe(0);
		expect(byId.get("a")?.position).toBe(1);
		expect(byId.get("a")?.body).toBe("plain a");
	});

	test("does not clobber column values the user already set", () => {
		sqlite.exec(
			`INSERT INTO saved_prompts (id, title, body, tags, is_favorite, copy_count, created_at, updated_at)
			 VALUES ('p', 'P', 'body' || char(10) || char(10) ||
			   '<!--rox:meta {"tags":["legacy"],"favorite":true,"useCount":9} -->',
			   '["kept"]', 0, 2, 1, 1);`,
		);

		backfillSavedPromptMetadata(asLocalDb());

		const [row] = db
			.select()
			.from(savedPrompts)
			.where(eq(savedPrompts.id, "p"))
			.all();
		// Existing non-default tags/copyCount are preserved; favorite (default
		// false) adopts the legacy value; body is cleaned regardless.
		expect(row?.tags).toEqual(["kept"]);
		expect(row?.copyCount).toBe(2);
		expect(row?.isFavorite).toBe(true);
		expect(row?.body).toBe("body");
	});
});
