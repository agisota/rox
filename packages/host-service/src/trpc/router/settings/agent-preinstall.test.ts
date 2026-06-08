import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { AgentPreinstaller } from "../../../runtime/agent-preinstall";
import type { HostServiceContext } from "../../../types";
import { agentPreinstallRouter } from "./agent-preinstall";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function createCaller() {
	const db = createTestDb();
	const preinstall = new AgentPreinstaller({
		db,
		runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		writeConfigFile: async () => {},
	});
	const ctx = {
		db,
		runtime: { preinstall },
		isAuthenticated: true,
	} as unknown as HostServiceContext;
	return { caller: agentPreinstallRouter.createCaller(ctx), preinstall };
}

describe("agentPreinstallRouter", () => {
	it("returns the catalog with default pending status before any run", async () => {
		const { caller } = createCaller();
		const status = await caller.status();

		expect(status.length).toBeGreaterThan(0);
		expect(status.every((entry) => entry.status === "pending")).toBe(true);
		// New expansion agents are part of the catalog.
		expect(status.map((e) => e.presetId)).toContain("qwen");
		expect(status.map((e) => e.presetId)).toContain("oh-my-claudecode");
	});

	it("kicks off a run and reflects installed status afterward", async () => {
		const { caller, preinstall } = createCaller();

		const started = await caller.run();
		expect(started).toEqual({ started: true });

		// `run` is fire-and-forget; await the underlying installer to settle.
		await preinstall.runAuto();

		const status = await caller.status();
		const qwen = status.find((e) => e.presetId === "qwen");
		expect(qwen?.status).toBe("installed");
	});

	it("skip marks an item skipped", async () => {
		const { caller } = createCaller();

		const result = await caller.skip({ presetId: "qwen" });
		expect(result).toEqual({ skipped: true });

		const status = await caller.status();
		expect(status.find((e) => e.presetId === "qwen")?.status).toBe("skipped");
	});

	it("skip reports false for an unknown preset", async () => {
		const { caller } = createCaller();
		const result = await caller.skip({ presetId: "not-a-real-preset" });
		expect(result).toEqual({ skipped: false });
	});
});
