import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { AGENT_ROLES, DEFAULT_ROLE_MODEL_ID } from "@rox/shared/agent-roles";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	getHostRoleModelMapping,
	resolveRoleModelForStep,
	setHostRoleModelMapping,
} from "./host-settings";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("role→model host settings", () => {
	it("defaults every role to ROX/ROX on a fresh row", () => {
		const db = createTestDb();
		const mapping = getHostRoleModelMapping(db);
		for (const role of AGENT_ROLES) {
			expect(mapping[role]).toEqual({
				agentId: "rox",
				modelId: DEFAULT_ROLE_MODEL_ID,
			});
		}
	});

	it("persists and re-reads an explicit per-role mapping", () => {
		const db = createTestDb();
		const next = getHostRoleModelMapping(db);
		next.planning = { agentId: "claude", modelId: "claude-sonnet" };
		next.execution = { agentId: "codex", modelId: "gpt-5-codex" };
		setHostRoleModelMapping(db, next);

		const read = getHostRoleModelMapping(db);
		expect(read.planning).toEqual({
			agentId: "claude",
			modelId: "claude-sonnet",
		});
		expect(read.execution).toEqual({
			agentId: "codex",
			modelId: "gpt-5-codex",
		});
		// Unset roles still resolve to the ROX default.
		expect(read.research).toEqual({
			agentId: "rox",
			modelId: DEFAULT_ROLE_MODEL_ID,
		});
	});

	it("routes a step to its configured role's model; unconfigured → ROX/ROX", () => {
		const db = createTestDb();
		const mapping = getHostRoleModelMapping(db);
		mapping.planning = { agentId: "claude", modelId: "claude-plan" };
		mapping.review = { agentId: "opencode", modelId: "oc-review" };
		setHostRoleModelMapping(db, mapping);

		expect(resolveRoleModelForStep(db, "plan the migration")).toEqual({
			agentId: "claude",
			modelId: "claude-plan",
		});
		expect(resolveRoleModelForStep(db, "review the PR")).toEqual({
			agentId: "opencode",
			modelId: "oc-review",
		});
		// Execution role was never configured.
		expect(resolveRoleModelForStep(db, "implement the feature")).toEqual({
			agentId: "rox",
			modelId: DEFAULT_ROLE_MODEL_ID,
		});
	});

	it("survives a corrupt stored value (resolves to all-ROX defaults)", () => {
		const db = createTestDb();
		db.insert(schema.hostSettings)
			.values({ id: 1, roleModelMappingJson: "{not valid json" })
			.onConflictDoUpdate({
				target: schema.hostSettings.id,
				set: { roleModelMappingJson: "{not valid json" },
			})
			.run();
		const mapping = getHostRoleModelMapping(db);
		expect(mapping.orchestrator).toEqual({
			agentId: "rox",
			modelId: DEFAULT_ROLE_MODEL_ID,
		});
	});
});
