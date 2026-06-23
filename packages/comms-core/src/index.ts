/**
 * @rox/comms-core — Identity & Comms Hub (D1) domain core.
 *
 * Pure TypeScript: the transport-adapter contract, the message router, and the
 * in-app reference adapter. No database writes — persistence is injected via
 * the ports in `./ports`.
 */

export {
	AdapterRegistry,
	EmailAdapter,
	type EmailAdapterOptions,
	type EmailAuthResult,
	type EmailAuthVerdict,
	type EmailInboundAttachment,
	type EmailOutboundPayload,
	type EmailRawInbound,
	InAppAdapter,
	type InAppRawMessage,
	normalizeSubject,
	type ResendSendFn,
	type SendContext,
	type SendResult,
	type TransportAdapter,
} from "./adapter";
export {
	type AuthVerdict,
	DEFAULT_SPAM_THRESHOLD,
	type SpamAuthSignals,
	type SpamContentSignals,
	type SpamScoreInput,
	type SpamScoreResult,
	scoreInboundSpam,
} from "./email";
export {
	deriveAddresses,
	normalizeHandle,
	ROX_ADDRESS_DOMAIN,
} from "./identity";
export type {
	AddressStore,
	CommsPorts,
	ContactResolver,
	DeliveryStore,
	MembersStore,
	MessageStore,
	PresenceStore,
	ResolvedRecipient,
	ThreadStore,
} from "./ports";
export {
	deriveDedupKey,
	MessageRouter,
	type MessageRouterOptions,
	type RouteInboundResult,
	type RouteOutboundResult,
} from "./router";
export * from "./types";
