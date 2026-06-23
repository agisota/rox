/**
 * Process-local pub/sub for live unified-inbox delivery (comms SSE, hardening
 * epic).
 *
 * This lives in `@rox/shared` (not `apps/api`) because two callers in the SAME
 * api process must share ONE bus instance:
 *   - the in-app send path (`@rox/trpc` `comms.sendMessage`), and
 *   - the inbound ingest + SSE route (`apps/api` mail/mesh/xmpp emit + stream).
 * `packages/trpc` cannot import from `apps/api`, so the singleton is hoisted here
 * and pinned on `globalThis` so every module instance in the process resolves the
 * same emitter.
 *
 * TRANSPORT SCOPE (DEFERRED): this is an in-process `EventEmitter`. An event
 * published on api instance A reaches only SSE clients connected to A. On
 * multi-instance Render a client can miss a live push from a write served by
 * another instance; the client's existing tRPC refetch is the backstop until
 * cross-instance fan-out lands. Swapping to Postgres LISTEN/NOTIFY or Redis is a
 * single-file change behind {@link CommsEventBus} — keep this publish/subscribe
 * surface and back it with the external bus.
 *
 * Neon note: the project's `@rox/db` driver is Neon serverless (HTTP + a WS
 * pool). The HTTP client cannot LISTEN/NOTIFY, and holding a dedicated long-lived
 * LISTEN connection through the Neon pooler per instance is a larger lift than
 * this slice — hence the deferral.
 */

import { EventEmitter } from "node:events";

/**
 * The minimal envelope an SSE client needs to react to a new message: enough to
 * auth-scope (org + thread) and to invalidate/append the right tRPC cache
 * entries, but NOT the full body (the client refetches the authoritative row).
 */
export interface CommsMessageEvent {
	/** Tenant that owns the thread — the first auth-scope gate. */
	organizationId: string;
	/** Thread the message landed in (drives client cache invalidation). */
	threadId: string;
	/** The persisted message id. */
	messageId: string;
	/** Transport the message arrived on (`inapp` | `email` | `mesh` | `xmpp`). */
	transport: string;
	/** Authoring rox user, when known (in-app sends + internal email). */
	authorUserId: string | null;
	/**
	 * The rox user ids that participate in the thread at publish time, when the
	 * publisher already knows them. Advisory only — the SSE route re-checks
	 * participation against `comms_participants` before forwarding, so a stale or
	 * missing set can never widen access.
	 */
	participantUserIds?: readonly string[];
	/** Publish timestamp (epoch ms) for client ordering/debug. */
	at: number;
}

/** A subscriber callback. Receives every published event; the route filters. */
export type CommsEventListener = (event: CommsMessageEvent) => void;

const EVENT_NAME = "comms:message";

/**
 * Process-local comms event bus. A thin, typed wrapper over EventEmitter so the
 * publish/subscribe surface is stable if the backing transport changes.
 */
export class CommsEventBus {
	private readonly emitter = new EventEmitter();

	constructor() {
		// SSE fan-out: one listener per open connection. Lift the default ceiling
		// so a busy instance with many inbox tabs does not log a false leak warning.
		this.emitter.setMaxListeners(0);
	}

	/** Publish a persisted-message event to every current subscriber. */
	publish(event: CommsMessageEvent): void {
		this.emitter.emit(EVENT_NAME, event);
	}

	/**
	 * Subscribe to all message events. Returns an unsubscribe fn the SSE route
	 * MUST call on disconnect/abort to avoid leaking listeners.
	 */
	subscribe(listener: CommsEventListener): () => void {
		this.emitter.on(EVENT_NAME, listener);
		return () => {
			this.emitter.off(EVENT_NAME, listener);
		};
	}

	/** Current subscriber count (tests/diagnostics). */
	listenerCount(): number {
		return this.emitter.listenerCount(EVENT_NAME);
	}
}

/**
 * Process-global singleton. Persist paths call {@link publishCommsMessage}; the
 * SSE route imports {@link commsEventBus}. Stashed on `globalThis` so Next's dev
 * hot-reload and multiple module instances share ONE bus within a process.
 */
const globalForCommsBus = globalThis as unknown as {
	__roxCommsEventBus?: CommsEventBus;
};

if (!globalForCommsBus.__roxCommsEventBus) {
	globalForCommsBus.__roxCommsEventBus = new CommsEventBus();
}

export const commsEventBus: CommsEventBus =
	globalForCommsBus.__roxCommsEventBus;

/**
 * Publish a new-message event onto the process-global bus. Safe to call from any
 * persist path; never throws (a pub/sub failure must not fail a write).
 */
export function publishCommsMessage(
	event: Omit<CommsMessageEvent, "at"> & { at?: number },
): void {
	try {
		commsEventBus.publish({ ...event, at: event.at ?? Date.now() });
	} catch {
		// Best-effort: live delivery is a non-durable enhancement over the
		// authoritative DB row + client refetch. Never let it break a send/ingest.
	}
}
