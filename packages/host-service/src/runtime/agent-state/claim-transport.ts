import type { ClaimResult } from "@rox/agent-state/core";
import type { ClaimRequest, ClaimTransport } from "@rox/agent-state/host";

/**
 * Real (Postgres-arbitrated) claim path for the agent-state coordination layer.
 *
 * Strict single-writer claims are NEVER resolved by libSQL last-writer-wins —
 * they go through WS-C's cloud `runtime.*` registry (a conditional / compare-and-set
 * upsert against `runtime_services` / `v2_hosts`). Because WS-C's claim procedure
 * may land after this workstream, the bridge accepts the procedure as an injected
 * callback: until WS-C wires it, `claimProc` is `undefined` and every claim
 * resolves `{ ok: false, reason: "claims-not-wired" }` so callers degrade
 * gracefully instead of falling back to (incorrect) LWW.
 *
 * When WS-C exposes the procedure, the host-service serve entrypoint binds
 * `claimProc` to `api.runtime.claim.mutate` and passes the resulting transport
 * into `startAgentStateRuntime({ claimTransport })`.
 */

/** The shape WS-C's cloud `runtime.claim` mutation must satisfy. */
export type RuntimeClaimProc = (input: ClaimRequest) => Promise<ClaimResult>;

export interface CreateApiClaimTransportOptions {
	/**
	 * The cloud claim mutation (e.g. `api.runtime.claim.mutate`). Omit until
	 * WS-C exposes it — claims then report not-wired.
	 */
	claimProc?: RuntimeClaimProc;
	/** Surface a transient claim failure (defaults to a console warning). */
	onError?: (error: unknown) => void;
}

const NOT_WIRED: ClaimResult = { ok: false, reason: "claims-not-wired" };

export function createApiClaimTransport(
	options: CreateApiClaimTransportOptions,
): ClaimTransport {
	const { claimProc, onError } = options;
	return {
		async claim(input: ClaimRequest): Promise<ClaimResult> {
			if (!claimProc) return NOT_WIRED;
			try {
				return await claimProc(input);
			} catch (error) {
				(onError ?? defaultOnError)(error);
				// A transport failure must NEVER silently grant a claim; degrade to
				// not-wired (refused) so single-writer correctness is preserved.
				return NOT_WIRED;
			}
		},
	};
}

function defaultOnError(error: unknown): void {
	console.warn("[host-service] agent-state claim transport failed:", error);
}
