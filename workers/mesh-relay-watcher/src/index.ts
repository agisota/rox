/**
 * Mesh relay-watcher entrypoint — STUB. Live Nostr subscription + key signing
 * are DEFERRED to the deploy wave (see ./contract.ts and the D5 spec). This stub
 * exists so the contract type-checks and the deploy surface is reserved; it
 * intentionally does nothing at runtime and is never started by CI or the
 * workspace.
 */

import type { RelayWatcherOutboundEvent } from "./contract";

export type {
	RelayWatcherAuthHeaders,
	RelayWatcherOutboundEvent,
} from "./contract";

/**
 * Placeholder for the deferred watcher loop. Implementing this is the deploy-wave
 * task: open relay sockets, unwrap NIP-17 DMs, and POST signed
 * {@link RelayWatcherOutboundEvent}s to `/api/mesh/inbound`.
 */
export function startRelayWatcher(): never {
	throw new Error(
		"mesh-relay-watcher is a contract stub; the live relay subscription is deferred to the deploy wave",
	);
}

// Documented unused-import guard so the contract type stays referenced.
export type RelayWatcherEvent = RelayWatcherOutboundEvent;
