import type { AgentStateScope, ClaimResult } from "../core/service";

/**
 * Strict single-writer claims escape hatch.
 *
 * libSQL embedded replicas are eventually consistent — last-writer-wins is the
 * WRONG tool for mutual exclusion. The few operations that need real
 * serialization ("only host A may run preinstall X", "claim workspace W") are
 * arbitrated by the cloud Postgres registry (`runtime_services` / `v2_hosts`)
 * via a conditional (compare-and-set) upsert exposed by WS-C's `runtime.*` tRPC.
 *
 * Because WS-C's `claim` procedure may land after this package, the claim path
 * is gated behind a {@link ClaimTransport} interface. When no transport is
 * wired, {@link requestClaim} resolves `{ ok: false, reason: "claims-not-wired" }`
 * so callers degrade gracefully instead of falling back to (incorrect) LWW.
 */

export interface ClaimRequest {
	orgId: string;
	deviceId: string;
	scope: AgentStateScope;
	scopeId: string;
	key: string;
}

/**
 * The Postgres-arbitrated claim surface. Implemented over WS-C's cloud
 * `runtime.*` tRPC once it exposes a conditional upsert; never by libSQL.
 */
export interface ClaimTransport {
	claim(input: ClaimRequest): Promise<ClaimResult>;
}

export interface RequestClaimOptions extends ClaimRequest {
	/** The cloud claim transport. When omitted, the claim is reported not-wired. */
	transport?: ClaimTransport;
}

/** A transport that always refuses — the default until WS-C wires the real one. */
export const notWiredClaimTransport: ClaimTransport = {
	async claim() {
		return { ok: false, reason: "claims-not-wired" };
	},
};

/**
 * Request a strict claim through the Postgres-arbitrated transport. Returns a
 * not-wired refusal when no transport is configured.
 */
export async function requestClaim(
	options: RequestClaimOptions,
): Promise<ClaimResult> {
	const { transport, ...request } = options;
	if (!transport) {
		return { ok: false, reason: "claims-not-wired" };
	}
	return transport.claim(request);
}

/** Adapt a {@link ClaimTransport} into the {@link ClaimResolver} the host service expects. */
export function claimResolverFromTransport(transport?: ClaimTransport): {
	claim(input: ClaimRequest): Promise<ClaimResult>;
} {
	return {
		async claim(input: ClaimRequest) {
			return requestClaim({ ...input, transport });
		},
	};
}
