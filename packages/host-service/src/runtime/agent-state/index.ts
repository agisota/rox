import type { AgentStateService } from "@rox/agent-state/core";
import type {
	ClaimTransport,
	CreateEmbeddedReplicaOptions,
	SyncLoopHandle,
} from "@rox/agent-state/host";
import {
	AgentStateHostService,
	claimResolverFromTransport,
	createEmbeddedReplica,
	startSyncLoop,
} from "@rox/agent-state/host";

/**
 * host-service integration seam for the cross-host agent-state coordination
 * layer (`@rox/agent-state`, WS-D). This is the ONLY new runtime manager the
 * workstream adds; it constructs the libSQL embedded replica + host service +
 * sync loop from env and exposes them on the `runtime` object in
 * `app.ts`, disposed in `dispose()` following the existing isolated-try/catch
 * teardown discipline (`packages/host-service/src/app.ts`).
 *
 * Opt-in: with no `AGENT_STATE_DB_PATH` the manager is DISABLED (zero behavior
 * change, `service === null`). With a path but no `TURSO_SYNC_URL` it runs in
 * pure-local (offline-first) mode. With both it becomes an embedded replica of a
 * Turso primary, with periodic + event-triggered sync.
 *
 * Strict single-writer claims are NEVER resolved by libSQL LWW; the claim path
 * is delegated to WS-C's Postgres-arbitrated `runtime.*` registry via an
 * injected {@link ClaimTransport}. Until WS-C wires it, claims degrade to
 * `{ ok: false, reason: "claims-not-wired" }` (the package default).
 */

/** The slice of host-service env the manager reads. */
export interface AgentStateEnv {
	/** Local libSQL file path (or `:memory:`). Absence → manager disabled. */
	AGENT_STATE_DB_PATH?: string;
	/** Turso primary URL. Absence → pure-local mode. */
	TURSO_SYNC_URL?: string;
	/** Inline auth token for the primary (resolved by the caller; never logged). */
	TURSO_AUTH_TOKEN?: string;
	/**
	 * Secret-key NAME for the primary auth token, resolved via the host's secret
	 * provider (cf. `runtime_services.secret_keys`). Used when the token must not
	 * be inlined into env.
	 */
	TURSO_AUTH_TOKEN_KEY?: string;
	/** Background sync cadence in ms. Defaults to 15s when synced. */
	AGENT_STATE_SYNC_INTERVAL_MS?: string;
}

export interface CreateAgentStateRuntimeManagerOptions {
	env: AgentStateEnv;
	/**
	 * Strict-claim transport (WS-C `runtime.*`). When omitted, claims resolve
	 * not-wired so callers degrade gracefully instead of falling back to LWW.
	 */
	claimTransport?: ClaimTransport;
	/**
	 * Resolve a secret value by key name (host secret provider). Required only
	 * when `TURSO_AUTH_TOKEN_KEY` is set without an inline `TURSO_AUTH_TOKEN`.
	 */
	resolveSecret?: (keyName: string) => Promise<string | undefined>;
	/**
	 * Injectable libSQL client factory. Production omits it (the native module is
	 * loaded lazily); tests pass a fake to stay off the native binding.
	 */
	createClient?: CreateEmbeddedReplicaOptions["createClient"];
}

export interface AgentStateRuntimeManager {
	/** True when a local path was configured (the manager constructed a service). */
	readonly enabled: boolean;
	/** True when configured against a Turso primary (sync mode). */
	readonly isSynced: boolean;
	/** The host agent-state service, or null when disabled. */
	readonly service: AgentStateService | null;
	/** Request an immediate, coalesced sync (no-op when disabled/local-only). */
	kickSync(): void;
	/** Stop the sync loop and close the libSQL handle. Idempotent. */
	dispose(): Promise<void>;
}

const DEFAULT_SYNC_INTERVAL_MS = 15_000;

function parseIntervalMs(raw: string | undefined): number {
	if (!raw) return DEFAULT_SYNC_INTERVAL_MS;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_SYNC_INTERVAL_MS;
}

/** A disabled manager — used when no `AGENT_STATE_DB_PATH` is configured. */
function disabledManager(): AgentStateRuntimeManager {
	return {
		enabled: false,
		isSynced: false,
		service: null,
		kickSync() {},
		async dispose() {},
	};
}

export async function createAgentStateRuntimeManager(
	options: CreateAgentStateRuntimeManagerOptions,
): Promise<AgentStateRuntimeManager> {
	const { env } = options;
	const localPath = env.AGENT_STATE_DB_PATH;
	if (!localPath) {
		return disabledManager();
	}

	const syncUrl = env.TURSO_SYNC_URL;
	let authToken = env.TURSO_AUTH_TOKEN;
	if (!authToken && env.TURSO_AUTH_TOKEN_KEY && options.resolveSecret) {
		authToken = await options.resolveSecret(env.TURSO_AUTH_TOKEN_KEY);
	}

	const intervalMs = parseIntervalMs(env.AGENT_STATE_SYNC_INTERVAL_MS);

	const replica = await createEmbeddedReplica({
		localPath,
		syncUrl,
		authToken,
		syncIntervalMs: syncUrl ? intervalMs : undefined,
		createClient: options.createClient,
	});

	const abort = new AbortController();
	let syncLoop: SyncLoopHandle | null = null;
	if (replica.isSynced) {
		syncLoop = startSyncLoop(replica, {
			intervalMs,
			signal: abort.signal,
			onError(error) {
				console.warn("[host-service] agent-state sync failed:", error);
			},
		});
	}

	const service = new AgentStateHostService({
		replica,
		claims: claimResolverFromTransport(options.claimTransport),
		onLocalWrite: () => syncLoop?.kick(),
	});

	let disposed = false;
	return {
		enabled: true,
		isSynced: replica.isSynced,
		service,
		kickSync() {
			syncLoop?.kick();
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			abort.abort();
			if (syncLoop) {
				await syncLoop.stop();
			}
			replica.close();
		},
	};
}
