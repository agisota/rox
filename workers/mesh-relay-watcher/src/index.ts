/**
 * Mesh relay-watcher entrypoint — the SERVER-ESCROW inbound bridge.
 *
 * This standalone process (NOT part of the bun/turbo workspace) is the mesh peer
 * of the D4 XMPP bridge / D3 mail worker. It subscribes the org-curated Nostr
 * relay set, receives NIP-17 gift-wrapped DMs (kind 1059) addressed to the
 * SERVER-HELD escrow pubkey, unwraps them server-side with the escrow private key
 * (loaded from Infisical/env — mesh is a transport-fallback bridge, not an
 * E2E-private product), and relays each resulting PLAINTEXT DM as a signed POST
 * to `/api/mesh/inbound`, where the existing ingest pipeline
 * (`MeshAdapter.normalizeInbound` → `mesh_delivery_log` dedup) takes over.
 *
 * SCOPE HONESTY: a LIVE end-to-end receive requires this process DEPLOYED + an
 * escrow key PROVISIONED on an always-on host (Fly/relay-style). That deploy is a
 * follow-up OUTSIDE CI. This module is the runnable bridge CODE; `startRelayWatcher`
 * is invoked by the deploy entrypoint, not by CI or the workspace.
 *
 * SECURITY: the escrow private key never leaves this process and is never logged.
 * Only event ids / pubkeys / statuses are logged.
 */

import { SimplePool, useWebSocketImplementation } from "nostr-tools/pool";
import type { Event as NostrEvent } from "nostr-tools/pure";
import WebSocket from "ws";
import { loadEscrowKey } from "./escrow";
import { postInboundMesh } from "./post";
import { GIFT_WRAP_KIND, unwrapGiftWrap } from "./unwrap";

export type {
	RelayWatcherAuthHeaders,
	RelayWatcherOutboundEvent,
} from "./contract";
export { loadEscrowKey } from "./escrow";
export {
	buildSignedMeshRequest,
	computeMeshSignature,
	postInboundMesh,
} from "./post";
export { DM_KIND, GIFT_WRAP_KIND, unwrapGiftWrap } from "./unwrap";

// nostr-tools needs a WebSocket implementation injected on Node (Bun has a
// global one, but injecting `ws` keeps the watcher runtime-agnostic).
if (typeof globalThis.WebSocket === "undefined") {
	useWebSocketImplementation(WebSocket);
}

export interface RelayWatcherConfig {
	/** Relay websocket urls to subscribe (`mesh_relays`-sourced at deploy). */
	relays: string[];
	/** The rox API base url (`MESH_API_URL`). */
	apiUrl: string;
	/** Shared HMAC secret for `/api/mesh/inbound` (`MESH_INBOUND_SECRET`). */
	inboundSecret: string;
	/** Only events at/after this unix-seconds bound are subscribed (default now). */
	since?: number;
	/** Optional structured logger (defaults to console). Never receives key bytes. */
	logger?: Pick<Console, "info" | "warn" | "error">;
}

/** A running watcher handle; call `stop()` to close the relay subscription. */
export interface RelayWatcherHandle {
	/** The derived escrow public key the watcher is subscribed for (hex). */
	escrowPubkey: string;
	stop(): void;
}

/**
 * Read the watcher config from the environment. Throws (without leaking secrets)
 * when a required var is missing so a misconfigured deploy fails fast.
 */
export function readConfigFromEnv(
	env: Record<string, string | undefined> = process.env,
): RelayWatcherConfig {
	const apiUrl = env.MESH_API_URL?.trim();
	const inboundSecret = env.MESH_INBOUND_SECRET?.trim();
	const relays = (env.MESH_RELAYS ?? "")
		.split(",")
		.map((r) => r.trim())
		.filter((r) => r.length > 0);

	if (!apiUrl) throw new Error("MESH_API_URL is not set");
	if (!inboundSecret) throw new Error("MESH_INBOUND_SECRET is not set");
	if (relays.length === 0) {
		throw new Error("MESH_RELAYS is empty (comma-separated wss:// urls)");
	}
	return { relays, apiUrl, inboundSecret };
}

/**
 * Start the live relay subscription. Connects the relay pool, subscribes
 * `kind:1059 #p=<escrowPubkey>` gift-wraps, and for each: unwraps server-side and
 * POSTs the plaintext to the API ingress. Dedup + persistence are the API's job
 * (the `mesh_delivery_log` ledger), so a relay redelivery is a harmless 409 here.
 *
 * The escrow KEY is loaded inside this function from the env so the secret is
 * scoped to the running process and never passed through config/logs.
 */
export function startRelayWatcher(
	config: RelayWatcherConfig,
	deps: {
		pool?: Pick<SimplePool, "subscribe" | "close">;
		env?: Record<string, string | undefined>;
	} = {},
): RelayWatcherHandle {
	const log = config.logger ?? console;
	const { secretKey, publicKey: escrowPubkey } = loadEscrowKey(deps.env);
	const pool = deps.pool ?? new SimplePool();

	const since = config.since ?? Math.floor(Date.now() / 1000);

	const sub = pool.subscribe(
		config.relays,
		{ kinds: [GIFT_WRAP_KIND], "#p": [escrowPubkey], since },
		{
			async onevent(wrap: NostrEvent) {
				let envelope: ReturnType<typeof unwrapGiftWrap>;
				try {
					envelope = unwrapGiftWrap(wrap, secretKey, { escrowPubkey });
				} catch (err) {
					// Non-DM / undecryptable / malformed wrap → skip, never crash the loop.
					log.warn(
						`mesh-relay-watcher: skipped gift-wrap ${wrap.id}: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
					return;
				}

				try {
					const res = await postInboundMesh({
						apiUrl: config.apiUrl,
						secret: config.inboundSecret,
						event: envelope,
					});
					// 200 accepted / 409 duplicate are both expected, non-error outcomes.
					if (res.status === 200 || res.status === 409) {
						log.info(
							`mesh-relay-watcher: ${
								res.status === 200 ? "accepted" : "duplicate"
							} event ${envelope.eventId ?? "(id-less)"}`,
						);
					} else {
						log.warn(
							`mesh-relay-watcher: ingest rejected event ${
								envelope.eventId ?? "(id-less)"
							} with status ${res.status}`,
						);
					}
				} catch (err) {
					log.error(
						`mesh-relay-watcher: POST failed for event ${
							envelope.eventId ?? "(id-less)"
						}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			},
			onclose(reasons) {
				log.warn(
					`mesh-relay-watcher: subscription closed: ${reasons.join(", ")}`,
				);
			},
		},
	);

	log.info(
		`mesh-relay-watcher: subscribed ${config.relays.length} relay(s) for escrow ${escrowPubkey}`,
	);

	return {
		escrowPubkey,
		stop() {
			sub.close();
			pool.close(config.relays);
		},
	};
}

/** Boot the watcher from the environment (the deploy-wave entrypoint). */
export function main(): RelayWatcherHandle {
	return startRelayWatcher(readConfigFromEnv());
}

// Run when invoked directly (`bun src/index.ts` / `node dist/index.js`), not when
// imported by a test. Guarded so the test import never opens a relay socket.
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	import.meta.url === `file://${process.argv[1]}`
) {
	main();
}
