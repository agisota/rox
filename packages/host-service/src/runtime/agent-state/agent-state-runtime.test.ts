import { afterEach, describe, expect, it } from "bun:test";
import type {
	CreateEmbeddedReplicaOptions,
	LibsqlClient,
	LibsqlValue,
} from "@rox/agent-state/host";
import { createAgentStateRuntimeManager } from "./index";

/**
 * Minimal in-memory libSQL fake — enough for the manager to bootstrap its
 * schema, read/write one entry, and prove `close()` is invoked on dispose.
 * Production passes the native `libsql` `createClient`; here we inject a fake so
 * the suite never loads the native binding.
 */
function createFakeClient(): {
	client: LibsqlClient;
	closed: () => boolean;
	syncCount: () => number;
} {
	const entries = new Map<string, Record<string, LibsqlValue>>();
	const presence = new Map<string, Record<string, LibsqlValue>>();
	let isClosed = false;
	let syncCalls = 0;

	// Positional bind args are `LibsqlValue | undefined` after destructuring; SQL
	// NULL is the right coercion for a missing bind.
	const nn = (v: LibsqlValue | undefined): LibsqlValue => v ?? null;

	const client: LibsqlClient = {
		async execute(stmt) {
			const sql = typeof stmt === "string" ? stmt : stmt.sql;
			const args = (typeof stmt === "string" ? [] : (stmt.args ?? [])) as
				| LibsqlValue[]
				| Record<string, LibsqlValue>;
			const list: LibsqlValue[] = Array.isArray(args)
				? args
				: Object.values(args);

			if (/^CREATE TABLE/i.test(sql) || /^CREATE.*INDEX/i.test(sql)) {
				return { rows: [], rowsAffected: 0 };
			}
			if (/INSERT INTO agent_state_entries/i.test(sql)) {
				const [
					id,
					orgId,
					deviceId,
					scope,
					scopeId,
					key,
					valueJson,
					revision,
					updatedAt,
				] = list;
				entries.set(`${orgId}|${scope}|${scopeId}|${key}`, {
					id: nn(id),
					org_id: nn(orgId),
					device_id: nn(deviceId),
					scope: nn(scope),
					scope_id: nn(scopeId),
					key: nn(key),
					value_json: nn(valueJson),
					revision: nn(revision),
					updated_at: nn(updatedAt),
				});
				return { rows: [], rowsAffected: 1 };
			}
			if (/SELECT \* FROM agent_state_entries WHERE/i.test(sql)) {
				const [orgId, scope, scopeId, key] = list;
				if (key !== undefined) {
					const row = entries.get(`${orgId}|${scope}|${scopeId}|${key}`);
					return { rows: row ? [row] : [], rowsAffected: 0 };
				}
				const rows = [...entries.values()].filter(
					(r) =>
						r.org_id === orgId && r.scope === scope && r.scope_id === scopeId,
				);
				return { rows, rowsAffected: 0 };
			}
			if (/INSERT INTO host_presence/i.test(sql)) {
				const [deviceId, orgId, machineId, hostKind, state, lastSeen, updated] =
					list;
				presence.set(String(deviceId), {
					device_id: nn(deviceId),
					org_id: nn(orgId),
					machine_id: nn(machineId),
					host_kind: nn(hostKind),
					state: nn(state),
					last_seen_at: nn(lastSeen),
					updated_at: nn(updated),
				});
				return { rows: [], rowsAffected: 1 };
			}
			if (/SELECT \* FROM host_presence WHERE/i.test(sql)) {
				const [deviceId] = list;
				const row = presence.get(String(deviceId));
				return { rows: row ? [row] : [], rowsAffected: 0 };
			}
			return { rows: [], rowsAffected: 0 };
		},
		async batch() {
			return [];
		},
		async sync() {
			syncCalls += 1;
			return undefined;
		},
		close() {
			isClosed = true;
		},
	};

	return {
		client,
		closed: () => isClosed,
		syncCount: () => syncCalls,
	};
}

function fakeCreateClient(
	client: LibsqlClient,
): NonNullable<CreateEmbeddedReplicaOptions["createClient"]> {
	return () => client;
}

describe("createAgentStateRuntimeManager", () => {
	let disposers: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const dispose of disposers) await dispose();
		disposers = [];
	});

	it("returns a disabled manager when no localPath is configured", async () => {
		const manager = await createAgentStateRuntimeManager({ env: {} });
		disposers.push(() => manager.dispose());

		expect(manager.enabled).toBe(false);
		expect(manager.service).toBeNull();
		// dispose is safe to call even when disabled.
		await manager.dispose();
	});

	it("starts in local-only mode when a path is set but no sync url", async () => {
		const fake = createFakeClient();
		const manager = await createAgentStateRuntimeManager({
			env: { AGENT_STATE_DB_PATH: ":memory:" },
			createClient: fakeCreateClient(fake.client),
		});
		disposers.push(() => manager.dispose());

		expect(manager.enabled).toBe(true);
		expect(manager.service).not.toBeNull();
		expect(manager.isSynced).toBe(false);

		const set = await manager.service?.set({
			orgId: "org-1",
			deviceId: "device-a",
			scope: "workspace",
			scopeId: "ws-1",
			key: "status",
			valueJson: JSON.stringify({ phase: "running" }),
		});
		expect(set?.revision).toBe(1);

		const got = await manager.service?.get({
			orgId: "org-1",
			scope: "workspace",
			scopeId: "ws-1",
			key: "status",
		});
		expect(got?.valueJson).toBe(JSON.stringify({ phase: "running" }));
	});

	it("closes the libSQL handle on dispose and is idempotent", async () => {
		const fake = createFakeClient();
		const manager = await createAgentStateRuntimeManager({
			env: { AGENT_STATE_DB_PATH: ":memory:" },
			createClient: fakeCreateClient(fake.client),
		});

		expect(fake.closed()).toBe(false);
		await manager.dispose();
		expect(fake.closed()).toBe(true);
		// Second dispose must not throw.
		await manager.dispose();
		expect(fake.closed()).toBe(true);
	});

	it("enables sync mode when a sync url is configured", async () => {
		const fake = createFakeClient();
		const manager = await createAgentStateRuntimeManager({
			env: {
				AGENT_STATE_DB_PATH: ":memory:",
				TURSO_SYNC_URL: "libsql://primary.example",
				TURSO_AUTH_TOKEN: "token-xyz",
			},
			createClient: fakeCreateClient(fake.client),
		});
		disposers.push(() => manager.dispose());

		expect(manager.enabled).toBe(true);
		expect(manager.isSynced).toBe(true);
		// kick() should trigger a sync via the loop.
		manager.kickSync();
		await Bun.sleep(5);
		expect(fake.syncCount()).toBeGreaterThan(0);
	});

	it("resolves the auth token via a provider when only a key name is given", async () => {
		const fake = createFakeClient();
		let resolvedKey: string | undefined;
		const manager = await createAgentStateRuntimeManager({
			env: {
				AGENT_STATE_DB_PATH: ":memory:",
				TURSO_SYNC_URL: "libsql://primary.example",
				TURSO_AUTH_TOKEN_KEY: "turso-primary",
			},
			createClient: fakeCreateClient(fake.client),
			resolveSecret: async (key) => {
				resolvedKey = key;
				return "resolved-secret";
			},
		});
		disposers.push(() => manager.dispose());

		expect(resolvedKey).toBe("turso-primary");
		expect(manager.isSynced).toBe(true);
	});
});
