import { describe, expect, it } from "bun:test";
import { createFakeLibsqlClient } from "./fake-client";
import { createEmbeddedReplica } from "./replica";

describe("createEmbeddedReplica", () => {
	it("opens in pure-local mode without a syncUrl and bootstraps tables", async () => {
		const fake = createFakeLibsqlClient();
		const replica = await createEmbeddedReplica({
			localPath: ":memory:",
			createClient: () => fake,
		});

		expect(replica.isSynced).toBe(false);

		// Write + read back through the bootstrapped schema.
		await replica.client.execute({
			sql: "INSERT INTO agent_state_entries (id, org_id, device_id, scope, scope_id, key, value_json, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: ["e1", "org_1", "dev_a", "run", "run_1", "k", '"v"', 1, 10],
		});
		const result = await replica.client.execute({
			sql: "SELECT * FROM agent_state_entries WHERE org_id = ? AND scope = ? AND scope_id = ? AND key = ?",
			args: ["org_1", "run", "run_1", "k"],
		});
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.value_json).toBe('"v"');

		// sync() is a no-op in local-only mode.
		await replica.sync();
		expect(fake.syncCalls).toBe(0);

		replica.close();
		expect(fake.closed).toBe(true);
	});

	it("treats a configured syncUrl as an embedded replica and syncs", async () => {
		const fake = createFakeLibsqlClient();
		const replica = await createEmbeddedReplica({
			localPath: "file:replica.db",
			syncUrl: "libsql://primary.example",
			authToken: "tkn",
			syncIntervalMs: 60000,
			createClient: () => fake,
		});

		expect(replica.isSynced).toBe(true);
		// One sync happened at open time to pull existing primary state.
		expect(fake.syncCalls).toBe(1);

		await replica.sync();
		expect(fake.syncCalls).toBe(2);
	});

	it("tolerates a sync failure at open time without throwing", async () => {
		const fake = createFakeLibsqlClient();
		let first = true;
		const flaky = {
			...fake,
			async sync() {
				if (first) {
					first = false;
					throw new Error("offline");
				}
				return { frame_no: 1, frames_synced: 0 };
			},
		};
		const replica = await createEmbeddedReplica({
			localPath: "file:replica.db",
			syncUrl: "libsql://primary.example",
			createClient: () => flaky,
		});
		expect(replica.isSynced).toBe(true);
	});
});
