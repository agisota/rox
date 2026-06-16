import type { ProvisionProvider } from "./types";

/**
 * Minimal shape the reaper needs from a persisted host row to decide whether
 * its ephemeral lifetime has lapsed. Decoupled from `@rox/db` so this stays a
 * pure, dependency-free unit (the runner maps `v2_hosts` rows onto this).
 */
export interface ReapableHost {
	/** Provider-native resource id (the `v2_hosts.machineId`). */
	id: string;
	provider: ProvisionProvider;
	/**
	 * ISO timestamp / `Date` when an ephemeral sandbox expires, or `null` for a
	 * persistent remote workspace. Persistent hosts are never reaped.
	 */
	expiresAt: Date | string | null;
}

export interface ReapPartition<T extends ReapableHost> {
	/** Hosts whose `expiresAt` is non-null and at/before the cutoff `now`. */
	expired: T[];
	/** Hosts that are persistent (null expiresAt) or not yet expired. */
	live: T[];
}

/** Parse an `expiresAt` to epoch ms, or `null` when absent/invalid. */
function toExpiryMs(expiresAt: Date | string | null): number | null {
	if (expiresAt === null) return null;
	const ms =
		expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Pure partition of hosts into those whose ephemeral TTL has lapsed (`expired`,
 * safe to destroy) and those to keep (`live`). A host is expired only when it
 * has a parseable non-null `expiresAt` at or before `now`. Persistent hosts
 * (null expiresAt) and hosts with unparseable timestamps are always kept live
 * so a bad value can never trigger a destructive reap. No I/O — the runner
 * feeds rows in and acts on `expired`.
 */
export function selectExpiredHosts<T extends ReapableHost>(
	hosts: readonly T[],
	now: Date = new Date(),
): ReapPartition<T> {
	const cutoff = now.getTime();
	const expired: T[] = [];
	const live: T[] = [];

	for (const host of hosts) {
		const expiryMs = toExpiryMs(host.expiresAt);
		if (expiryMs !== null && expiryMs <= cutoff) {
			expired.push(host);
		} else {
			live.push(host);
		}
	}

	return { expired, live };
}

/** Result of one reap sweep over a batch of hosts. */
export interface ReapOutcome {
	/** Whether destruction was actually performed (vs. a dry run). */
	enabled: boolean;
	/** Ids of every expired reap candidate, regardless of `enabled`. */
	expired: string[];
	/** Ids actually destroyed (empty on a dry run). */
	reaped: string[];
	/** Per-host destroy failures — a bad destroy never aborts the sweep. */
	failed: { id: string; error: string }[];
	/** Count of live (non-expired / persistent) hosts left untouched. */
	kept: number;
}

/**
 * Sweep a batch of hosts and destroy the expired ones via the injected
 * `destroy`. Destruction is GATED OFF by default (`enabled` defaults to
 * `false`): a disabled sweep is a pure dry run that reports the reap candidates
 * (`expired`) without calling `destroy` even once, so it is safe to wire into
 * an observability loop before anyone flips the kill switch on. When enabled,
 * hosts are destroyed sequentially (no provider stampede) and a failure on one
 * host is captured in `failed` without aborting the rest. No I/O of its own —
 * the runner supplies the rows and a provider-backed `destroy`.
 */
export async function reapExpiredHosts<T extends ReapableHost>(args: {
	hosts: readonly T[];
	destroy: (host: T) => Promise<void>;
	/** Defaults to `false` (kill switch off → dry run, never destroys). */
	enabled?: boolean;
	now?: Date;
}): Promise<ReapOutcome> {
	const { hosts, destroy, enabled = false, now } = args;
	const { expired, live } = selectExpiredHosts(hosts, now);
	const outcome: ReapOutcome = {
		enabled,
		expired: expired.map((h) => h.id),
		reaped: [],
		failed: [],
		kept: live.length,
	};

	if (!enabled) return outcome;

	for (const host of expired) {
		try {
			await destroy(host);
			outcome.reaped.push(host.id);
		} catch (error) {
			outcome.failed.push({
				id: host.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return outcome;
}
