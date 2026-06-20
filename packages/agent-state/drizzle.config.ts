import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config for the cross-host agent-state libSQL database.
 *
 * This is a SEPARATE toolchain from `packages/db` (Neon Postgres / Electric).
 * Migrations are emitted under THIS package's own `drizzle/` directory and are
 * generated offline with `drizzle-kit generate` only — never `migrate`/`push`,
 * and never into `packages/db/drizzle/` (off-limits per AGENTS.md).
 */
export default defineConfig({
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
});
