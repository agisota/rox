import type { ClaimResult } from "@rox/agent-state/core";
import type { ClaimRequest, ClaimTransport } from "@rox/agent-state/host";
import type { AppRouter } from "@rox/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { createApiClaimTransport } from "./claim-transport";

/**
 * Build the real (Postgres-arbitrated) claim transport for the agent-state
 * runtime by binding it to the cloud `runtime.claim` mutation.
 *
 * `runtime.claim` is a `serviceProcedure`: it is authorized by the static
 * `RUNTIME_SERVICE_TOKEN` carried in the `x-rox-service-token` header, NOT by a
 * user session. So this client is deliberately SEPARATE from the user-JWT
 * `createApiClient` — it sends only the service token (the claim procedure reads
 * the org from its input, so no org header is required).
 *
 * Wiring is opt-in: with no `RUNTIME_SERVICE_TOKEN` the claim transport is left
 * unwired and every claim degrades to `{ ok: false, reason: "claims-not-wired" }`
 * (never an incorrect grant), preserving zero-behavior-change for hosts that
 * have not provisioned the service token.
 */

/** The header `serviceProcedure` checks (constant-time) for the runtime token. */
const SERVICE_TOKEN_HEADER = "x-rox-service-token";

/**
 * Minimal decorated-client view of just the `runtime.claim` mutation.
 *
 * tRPC's `serviceProcedure` (publicProcedure + service-token middleware) is not
 * surfaced on the full `AppRouter` decorated record under this package's strict
 * tsconfig — the same is true of the sibling `runtime.claimBatch`, which is
 * likewise only ever invoked over plain HTTP by the worker, never through the
 * typed client. Rather than depend on that fragile inference, we pin the slice
 * we actually use to its exact I/O (`ClaimRequest` → `ClaimResult`, matching the
 * server's `claimInput`/`claimOutput`). The runtime path `runtime.claim` and the
 * payload shape are exactly what the server exposes, so the cast is sound; the
 * call boundary stays fully typed.
 */
interface ClaimClient {
	runtime: {
		claim: { mutate(input: ClaimRequest): Promise<ClaimResult> };
	};
}

export interface CreateClaimTransportOptions {
	/** Cloud API base URL (same origin as {@link createApiClient}). */
	cloudApiUrl: string;
	/** The runtime service token (`RUNTIME_SERVICE_TOKEN`). */
	serviceToken: string;
	/** Surface a transient claim failure (defaults to a console warning). */
	onError?: (error: unknown) => void;
}

/**
 * Construct a `ClaimTransport` bound to the cloud `runtime.claim` mutation.
 * Returns `undefined` when no service token is configured, so the caller leaves
 * the runtime claim path unwired (graceful not-wired) instead of wiring a client
 * that would be rejected with `UNAUTHORIZED` on every claim.
 */
export function createServiceTokenClaimTransport(
	options: CreateClaimTransportOptions,
): ClaimTransport | undefined {
	const { cloudApiUrl, serviceToken, onError } = options;
	if (!serviceToken) return undefined;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${cloudApiUrl}/api/trpc`,
				transformer: SuperJSON,
				headers() {
					return { [SERVICE_TOKEN_HEADER]: serviceToken };
				},
			}),
		],
		// See `ClaimClient`: pin only the claim slice we invoke.
	}) as unknown as ClaimClient;

	const claimProc = (input: ClaimRequest): Promise<ClaimResult> =>
		client.runtime.claim.mutate(input);

	return createApiClaimTransport({ claimProc, onError });
}
