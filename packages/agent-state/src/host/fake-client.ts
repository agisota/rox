import type {
	LibsqlClient,
	LibsqlResultSet,
	LibsqlStatement,
	LibsqlValue,
} from "./replica";

/**
 * A tiny in-memory libSQL-shaped client used by tests so the package can be
 * exercised end to end without the native `libsql` binding. It supports just the
 * SQL the agent-state host layer emits: the bootstrap DDL plus parameterized
 * INSERT … ON CONFLICT / SELECT against the three coordination tables.
 *
 * It is intentionally NOT a general SQL engine — it pattern-matches the exact
 * statements `AgentStateHostService` and `createEmbeddedReplica` produce.
 */

type Row = Record<string, LibsqlValue>;

function normalizeArgs(stmt: string | LibsqlStatement): LibsqlValue[] {
	if (typeof stmt === "string") return [];
	const args = stmt.args ?? [];
	return Array.isArray(args) ? args : Object.values(args);
}

function sqlText(stmt: string | LibsqlStatement): string {
	return typeof stmt === "string" ? stmt : stmt.sql;
}

export interface FakeLibsqlClient extends LibsqlClient {
	syncCalls: number;
	closed: boolean;
}

export function createFakeLibsqlClient(): FakeLibsqlClient {
	const tables = new Map<string, Map<string, Row>>([
		["agent_state_entries", new Map()],
		["host_presence", new Map()],
		["agent_run_coord", new Map()],
	]);
	let syncCalls = 0;
	let closed = false;

	const empty = (): LibsqlResultSet => ({ rows: [], rowsAffected: 0 });

	const tableOf = (name: string): Map<string, Row> => {
		const table = tables.get(name);
		if (!table) throw new Error(`unknown table: ${name}`);
		return table;
	};

	function execute(stmt: string | LibsqlStatement): LibsqlResultSet {
		const sql = sqlText(stmt).trim();
		const args = normalizeArgs(stmt);

		if (/^create table/i.test(sql) || /^create.*index/i.test(sql)) {
			return empty();
		}

		// INSERT INTO agent_state_entries ... ON CONFLICT ... (LWW upsert)
		if (/^insert into agent_state_entries/i.test(sql)) {
			const table = tableOf("agent_state_entries");
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
			] = args;
			const uniqueKey = `${orgId} ${scope} ${scopeId} ${key}`;
			const existing = table.get(uniqueKey);
			const nextRevision = Number(revision);
			const nextUpdatedAt = Number(updatedAt);
			const winsLww =
				!existing ||
				nextRevision > Number(existing.revision) ||
				(nextRevision === Number(existing.revision) &&
					nextUpdatedAt >= Number(existing.updated_at));
			if (winsLww) {
				table.set(uniqueKey, {
					id: id ?? null,
					org_id: orgId ?? null,
					device_id: deviceId ?? null,
					scope: scope ?? null,
					scope_id: scopeId ?? null,
					key: key ?? null,
					value_json: valueJson ?? null,
					revision: nextRevision,
					updated_at: nextUpdatedAt,
				});
				return { rows: [], rowsAffected: 1 };
			}
			return empty();
		}

		// SELECT a single agent_state_entries row by unique key
		if (
			/^select .* from agent_state_entries/i.test(sql) &&
			/org_id = \? and scope = \? and scope_id = \? and key = \?/i.test(sql)
		) {
			const table = tableOf("agent_state_entries");
			const [orgId, scope, scopeId, key] = args;
			const row = table.get(`${orgId} ${scope} ${scopeId} ${key}`);
			return { rows: row ? [row] : [], rowsAffected: 0 };
		}

		// SELECT all entries for a scope
		if (/^select .* from agent_state_entries/i.test(sql)) {
			const table = tableOf("agent_state_entries");
			const [orgId, scope, scopeId] = args;
			const rows = [...table.values()].filter(
				(r) =>
					r.org_id === orgId && r.scope === scope && r.scope_id === scopeId,
			);
			return { rows, rowsAffected: 0 };
		}

		// INSERT INTO host_presence ... ON CONFLICT
		if (/^insert into host_presence/i.test(sql)) {
			const table = tableOf("host_presence");
			const [
				deviceId,
				orgId,
				machineId,
				hostKind,
				state,
				lastSeenAt,
				updatedAt,
			] = args;
			table.set(String(deviceId), {
				device_id: deviceId ?? null,
				org_id: orgId ?? null,
				machine_id: machineId ?? null,
				host_kind: hostKind ?? null,
				state: state ?? null,
				last_seen_at: Number(lastSeenAt),
				updated_at: Number(updatedAt),
			});
			return { rows: [], rowsAffected: 1 };
		}

		if (/^select .* from host_presence/i.test(sql)) {
			const table = tableOf("host_presence");
			const [deviceId] = args;
			const row = table.get(String(deviceId));
			return { rows: row ? [row] : [], rowsAffected: 0 };
		}

		return empty();
	}

	return {
		async execute(stmt) {
			return execute(stmt);
		},
		async batch(stmts) {
			return stmts.map(execute);
		},
		async sync() {
			syncCalls += 1;
			return { frame_no: syncCalls, frames_synced: 0 };
		},
		close() {
			closed = true;
		},
		get syncCalls() {
			return syncCalls;
		},
		get closed() {
			return closed;
		},
	};
}
