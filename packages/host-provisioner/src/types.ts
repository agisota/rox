/**
 * Provider-agnostic contract for provisioning remote hosts and ephemeral
 * sandboxes for the remote-hosts epic. Adapters (Daytona / Modal / E2B)
 * implement {@link HostProvisioner}; the tRPC layer maps the result onto the
 * `v2_hosts` row (kind / provider / port / protocol / expiresAt).
 *
 * Kept dependency-free (no `@rox/db`, no node built-ins) so it can be unit
 * tested with a mocked `fetch` and imported from the API server cleanly.
 */

/** Persistent remote workspace vs. ephemeral sandbox (TTL-bound). */
export type ProvisionKind = "remote" | "sandbox";

/** Managed backends. `self` (user-run `rox deploy`) is not provisioned here. */
export type ProvisionProvider = "daytona" | "modal" | "e2b";

export interface ProvisionInput {
	kind: ProvisionKind;
	/** Ephemeral sandbox lifetime in ms. Ignored for persistent `remote`. */
	ttlMs?: number;
	/** Optional provider region hint. */
	region?: string;
	/** Optional human-friendly label forwarded to the provider. */
	label?: string;
}

export interface ProvisionedHost {
	/** Provider-native resource id (used as the host machineId). */
	id: string;
	provider: ProvisionProvider;
	kind: ProvisionKind;
	/** Reachable hostname / ip. */
	host: string;
	port: number;
	protocol: string;
	/** ISO timestamp when an ephemeral sandbox expires; null = persistent. */
	expiresAt: string | null;
}

export type HostStatusState =
	| "provisioning"
	| "running"
	| "stopped"
	| "unknown";

export interface HostStatus {
	id: string;
	state: HostStatusState;
	expiresAt: string | null;
}

export interface HostProvisioner {
	readonly provider: ProvisionProvider;
	provision(input: ProvisionInput): Promise<ProvisionedHost>;
	destroy(id: string): Promise<void>;
	status(id: string): Promise<HostStatus>;
}

/** Injectable fetch so adapters can be unit tested without real HTTP. */
export type FetchLike = (
	input: string,
	init?: RequestInit,
) => Promise<Response>;

export interface ProvisionerConfig {
	apiKey: string;
	baseUrl?: string;
	/** Defaults to global `fetch`. */
	fetch?: FetchLike;
}
