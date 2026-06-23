/**
 * Re-export of the process-global comms event bus (hardening epic).
 *
 * The bus itself lives in `@rox/shared/comms-events` so the in-app send path
 * (`@rox/trpc`) and the api-side ingest + SSE route share ONE singleton in the
 * api process — `packages/trpc` cannot import from `apps/api`. This module exists
 * only so api-side callers keep a local, intention-revealing import path.
 */

export {
	type CommsEventListener,
	type CommsMessageEvent,
	commsEventBus,
	publishCommsMessage,
} from "@rox/shared/comms-events";
