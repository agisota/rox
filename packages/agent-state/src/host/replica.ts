import { AGENT_STATE_DDL } from "../schema";

/**
 * Embedded-replica connector for the agent-state libSQL database.
 *
 * Wraps the native `libsql` `createClient` API (the same engine `@libsql/client`
 * exposes). When `syncUrl` is provided the local file is an embedded replica of a
 * Turso primary: reads are local-speed, writes go local then converge via
 * `sync()`. When `syncUrl` is absent it is a pure-local SQLite file — offline-first
 * — and `sync()` is a no-op so callers never branch on configuration.
 */

/** A SQL bind value accepted by libSQL. */
export type LibsqlValue =
	| string
	| number
	| boolean
	| null
	| Uint8Array
	| bigint;

/** The libSQL statement form used by `execute`/`batch`. */
export interface LibsqlStatement {
	sql: string;
	args?: LibsqlValue[] | Record<string, LibsqlValue>;
}

/** Result of a libSQL `execute`. */
export interface LibsqlResultSet {
	rows: Array<Record<string, LibsqlValue>>;
	rowsAffected: number;
	lastInsertRowid?: bigint;
}

/** The slice of the libSQL `Client` this package depends on. */
export interface LibsqlClient {
	execute(stmt: string | LibsqlStatement): Promise<LibsqlResultSet>;
	batch(
		stmts: Array<string | LibsqlStatement>,
		mode?: "write" | "read" | "deferred",
	): Promise<LibsqlResultSet[]>;
	sync?(): Promise<unknown>;
	close(): void;
}

export interface CreateEmbeddedReplicaOptions {
	/** Local SQLite file path (or `:memory:`). */
	localPath: string;
	/** Turso primary URL. Absence → pure-local (offline-first) mode. */
	syncUrl?: string;
	/** Auth token for the primary (resolved by the caller; never inlined). */
	authToken?: string;
	/** Automatic background sync cadence in ms. Omit to disable background sync. */
	syncIntervalMs?: number;
	/** Local writes visible before sync. Defaults to true. */
	readYourWrites?: boolean;
	/**
	 * Injectable client factory (tests pass a fake; production passes the native
	 * `libsql` `createClient`). When omitted, the native module is loaded lazily.
	 */
	createClient?: (config: {
		url: string;
		syncUrl?: string;
		authToken?: string;
		syncInterval?: number;
		readYourWrites?: boolean;
	}) => LibsqlClient;
}

export interface AgentStateReplica {
	readonly client: LibsqlClient;
	/** True when configured against a Turso primary. */
	readonly isSynced: boolean;
	/** Push/pull with the primary. No-op (resolves) in pure-local mode. */
	sync(): Promise<void>;
	close(): void;
}

function toFileUrl(localPath: string): string {
	if (localPath === ":memory:") return ":memory:";
	if (localPath.startsWith("file:") || localPath.includes("://")) {
		return localPath;
	}
	return `file:${localPath}`;
}

async function loadNativeCreateClient(): Promise<
	NonNullable<CreateEmbeddedReplicaOptions["createClient"]>
> {
	// Lazy import so the package is consumable (and testable) without the native
	// binding present until a real replica is actually opened.
	const mod = (await import("libsql")) as unknown as {
		createClient?: NonNullable<CreateEmbeddedReplicaOptions["createClient"]>;
		default?: {
			createClient?: NonNullable<CreateEmbeddedReplicaOptions["createClient"]>;
		};
	};
	const factory = mod.createClient ?? mod.default?.createClient;
	if (!factory) {
		throw new Error(
			"libsql native module does not expose createClient; cannot open embedded replica",
		);
	}
	return factory;
}

/**
 * Open (and bootstrap) an agent-state embedded replica. The schema is applied
 * idempotently via `CREATE TABLE IF NOT EXISTS` so a fresh local file or primary
 * is usable immediately.
 */
export async function createEmbeddedReplica(
	options: CreateEmbeddedReplicaOptions,
): Promise<AgentStateReplica> {
	const factory = options.createClient ?? (await loadNativeCreateClient());
	const isSynced = Boolean(options.syncUrl);

	const client = factory({
		url: toFileUrl(options.localPath),
		syncUrl: options.syncUrl,
		authToken: options.authToken,
		syncInterval:
			isSynced && options.syncIntervalMs !== undefined
				? Math.max(1, Math.round(options.syncIntervalMs / 1000))
				: undefined,
		readYourWrites: options.readYourWrites ?? true,
	});

	// Pull any existing primary state before bootstrapping local tables so we do
	// not race the schema against a synced copy.
	if (isSynced && client.sync) {
		try {
			await client.sync();
		} catch {
			// Offline at open time is acceptable; local reads/writes proceed and a
			// later sync() converges.
		}
	}

	for (const statement of AGENT_STATE_DDL) {
		await client.execute(statement);
	}

	return {
		client,
		isSynced,
		async sync() {
			if (!isSynced || !client.sync) return;
			await client.sync();
		},
		close() {
			client.close();
		},
	};
}
