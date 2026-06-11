import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import {
	AgentPreinstaller,
	type CommandResult,
	type CommandRunner,
} from "./installer";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

const ok: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
const fail: CommandResult = { exitCode: 1, stdout: "", stderr: "boom" };

/**
 * Records every command run and answers from a per-command map. Commands not
 * in the map default to a non-zero "not found" so `checkCommand` reads as
 * "binary absent" unless a test says otherwise.
 */
function makeRunner(
	answers: Record<string, CommandResult> = {},
	fallback: CommandResult = fail,
): {
	run: CommandRunner;
	calls: string[];
} {
	const calls: string[] = [];
	const run: CommandRunner = async (command) => {
		calls.push(command);
		return answers[command] ?? fallback;
	};
	return { run, calls };
}

/** Runner that succeeds for every command. */
function makeOkRunner(): { run: CommandRunner; calls: string[] } {
	return makeRunner({}, ok);
}

describe("AgentPreinstaller", () => {
	it("auto-installs only non-optional items with install commands", async () => {
		const db = createTestDb();
		const { run, calls } = makeOkRunner();
		const installer = new AgentPreinstaller({
			db,
			runCommand: run,
			writeConfigFile: async () => {},
		});

		const results = await installer.runAuto();
		const installed = results.filter((r) => r.status === "installed");

		// qwen is the only non-optional agent with an install command; the two
		// non-optional harnesses (oh-my-claudecode, oh-my-codex) also install.
		const presetIds = installed.map((r) => r.presetId).sort();
		expect(presetIds).toEqual(["oh-my-claudecode", "oh-my-codex", "qwen"]);

		// Optional agents are never auto-attempted.
		expect(calls.some((c) => c.includes("grok-cli"))).toBe(false);
	});

	it("treats a passing checkCommand as already-present and skips install", async () => {
		const db = createTestDb();
		const { run, calls } = makeRunner({ "qwen --version": ok });
		const installer = new AgentPreinstaller({
			db,
			runCommand: run,
			writeConfigFile: async () => {},
		});

		const result = await installer.runOne("qwen");

		expect(result?.status).toBe("installed");
		expect(result?.alreadyPresent).toBe(true);
		expect(calls).not.toContain("npm install -g @qwen-code/qwen-code@latest");
	});

	it("records a failed install with its error and supports retry", async () => {
		const db = createTestDb();
		const failingRunner = makeRunner();
		const installer = new AgentPreinstaller({
			db,
			runCommand: failingRunner.run,
			writeConfigFile: async () => {},
		});

		const failed = await installer.runOne("qwen");
		expect(failed?.status).toBe("failed");
		expect(failed?.error).toContain("@qwen-code/qwen-code");

		const failedEntry = installer
			.getStatus()
			.find((e) => e.presetId === "qwen");
		expect(failedEntry?.status).toBe("failed");
		expect(failedEntry?.lastError).toBeTruthy();

		// Retry with a now-succeeding runner flips it to installed.
		const recovering = new AgentPreinstaller({
			db,
			runCommand: makeRunner({
				"npm install -g @qwen-code/qwen-code@latest": ok,
			}).run,
			writeConfigFile: async () => {},
		});
		const retried = await recovering.runOne("qwen");
		expect(retried?.status).toBe("installed");
		expect(
			recovering.getStatus().find((e) => e.presetId === "qwen")?.lastError,
		).toBeNull();
	});

	it("skips an item so auto-install leaves it alone", async () => {
		const db = createTestDb();
		const { run, calls } = makeRunner();
		const installer = new AgentPreinstaller({
			db,
			runCommand: run,
			writeConfigFile: async () => {},
		});

		expect(installer.skip("qwen")).toBe(true);
		await installer.runAuto();

		expect(calls.some((c) => c.includes("@qwen-code/qwen-code"))).toBe(false);
		expect(
			installer.getStatus().find((e) => e.presetId === "qwen")?.status,
		).toBe("skipped");
	});

	it("is idempotent: a second auto run does not reinstall installed items", async () => {
		const db = createTestDb();
		const first = makeOkRunner();
		const installer = new AgentPreinstaller({
			db,
			runCommand: first.run,
			writeConfigFile: async () => {},
		});
		await installer.runAuto();

		const second = makeOkRunner();
		const installer2 = new AgentPreinstaller({
			db,
			runCommand: second.run,
			writeConfigFile: async () => {},
		});
		const results = await installer2.runAuto();

		// Nothing left to install — everything is already installed.
		expect(results.length).toBe(0);
		expect(second.calls.length).toBe(0);
	});
});
