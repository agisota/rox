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
