/**
 * Core contract for the cross-host agent-state coordination layer.
 *
 * This module is the transport-agnostic interface that both sides agree on,
 * mirroring the `core/host/client` split of `@rox/workspace-fs`
 * (`packages/workspace-fs/src/core/service.ts`). It contains NO I/O: the host
 * layer (`../host`) backs it with a libSQL embedded replica; the client layer
 * (`../client`) proxies every method over a transport.
 *
 * What this layer carries is the OBSERVABLE, CONVERGENT slice of agent
 * coordination (presence, run progress/heartbeat, "who is doing what") — never
 * secrets, PTY bytes, file contents, or durable UI rows. Strict mutual
 * exclusion (single-writer claims) is NOT modelled here as last-writer-wins;
 * it is delegated to the Postgres-arbitrated claim path (`../host/claims`).
 */

/** The coordination scope an entry/presence/run row is keyed under. */
export type AgentStateScope = "workspace" | "run" | "host";

/** Liveness of a host as observed by its peers. */
export type HostPresenceState = "online" | "draining" | "offline";

/** Status of a coordinated agent run. */
export type AgentRunStatus =
	| "pending"
	| "running"
	| "paused"
	| "completed"
	| "failed";

/**
 * A single convergent key/value coordination entry, owner-scoped and
 * last-writer-wins per `(orgId, scope, scopeId, key)`.
 */
export interface AgentStateEntry {
	id: string;
	orgId: string;
	/** Origin host that authored this revision. */
	deviceId: string;
	scope: AgentStateScope;
	scopeId: string;
	key: string;
	/** JSON-serialized payload. */
	valueJson: string;
	/** Monotonic per-key revision used for LWW conflict resolution. */
	revision: number;
	/** Epoch millis of last write (LWW tiebreak after `revision`). */
	updatedAt: number;
}

/** Input to write/replace an entry. `revision`/`updatedAt` may be assigned by the host. */
export interface AgentStateEntryInput {
	orgId: string;
	deviceId: string;
	scope: AgentStateScope;
	scopeId: string;
	key: string;
	valueJson: string;
	/** Optional caller-provided revision; the host enforces monotonic LWW. */
	revision?: number;
	/** Optional caller-provided timestamp; defaults to now on the host. */
	updatedAt?: number;
}

/** Per-host liveness record. */
export interface HostPresence {
	deviceId: string;
	orgId: string;
	machineId: string;
	hostKind: "local" | "cloud";
	state: HostPresenceState;
	lastSeenAt: number;
	updatedAt: number;
}

/** Input to report/refresh a host's presence. */
export interface HostPresenceInput {
	deviceId: string;
	orgId: string;
	machineId: string;
	hostKind: "local" | "cloud";
	state: HostPresenceState;
	/** Defaults to now on the host. */
	lastSeenAt?: number;
}

/** Per-run coordination record (progress + ownership + heartbeat). */
export interface AgentRunCoord {
	runId: string;
	orgId: string;
	workspaceId: string;
	ownerDevice: string;
	step: number;
	status: AgentRunStatus;
	heartbeatAt: number;
	updatedAt: number;
}

/** A change notification emitted to scope subscribers. */
export interface AgentStateChange {
	scope: AgentStateScope;
	scopeId: string;
	entries: AgentStateEntry[];
}

/** Result of a strict (Postgres-arbitrated) claim request. */
export interface ClaimResult {
	ok: boolean;
	/** Present when granted: the device now holding the claim. */
	ownerDevice?: string;
	/** Present when refused/not-wired: machine-readable reason. */
	reason?: string;
}

export interface AgentStateService {
	/** Read a single entry, or null when absent. */
	get(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
		key: string;
	}): Promise<AgentStateEntry | null>;

	/** Upsert an entry under last-writer-wins semantics. Returns the persisted row. */
	set(input: AgentStateEntryInput): Promise<AgentStateEntry>;

	/** List every entry currently in a scope. */
	listScope(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
	}): Promise<{ entries: AgentStateEntry[] }>;

	/** Subscribe to changes within a scope (cache-first: yields the current snapshot first). */
	subscribeScope(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
	}): AsyncIterable<AgentStateChange>;

	/** Report/refresh this host's presence. Returns the persisted row. */
	reportPresence(input: HostPresenceInput): Promise<HostPresence>;

	/**
	 * Request a strict single-writer claim. Delegated to the cloud
	 * Postgres-arbitrated path (NEVER resolved by libSQL LWW). When the claim
	 * transport is not yet wired, resolves `{ ok: false, reason: "claims-not-wired" }`.
	 */
	claim(input: {
		orgId: string;
		deviceId: string;
		scope: AgentStateScope;
		scopeId: string;
		key: string;
	}): Promise<ClaimResult>;
}

/** Request methods exposed over a transport (everything except subscriptions). */
export interface AgentStateRequestMap {
	get: {
		input: {
			orgId: string;
			scope: AgentStateScope;
			scopeId: string;
			key: string;
		};
		output: AgentStateEntry | null;
	};
	set: {
		input: AgentStateEntryInput;
		output: AgentStateEntry;
	};
	listScope: {
		input: { orgId: string; scope: AgentStateScope; scopeId: string };
		output: { entries: AgentStateEntry[] };
	};
	reportPresence: {
		input: HostPresenceInput;
		output: HostPresence;
	};
	claim: {
		input: {
			orgId: string;
			deviceId: string;
			scope: AgentStateScope;
			scopeId: string;
			key: string;
		};
		output: ClaimResult;
	};
}

/** Subscription methods exposed over a transport. */
export interface AgentStateSubscriptionMap {
	subscribeScope: {
		input: { orgId: string; scope: AgentStateScope; scopeId: string };
		event: AgentStateChange;
	};
}
