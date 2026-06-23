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
	MeshAdapter,
	type MeshAdapterOptions,
	type MeshPublishFn,
	type MeshRawInbound,
	type MeshSignedEvent,
	type MeshSignFn,
	type MeshUnsignedEvent,
	normalizeSubject,
	type ResendSendFn,
	type SendContext,
	type SendResult,
	type TransportAdapter,
	XmppAdapter,
	type XmppAdapterOptions,
	type XmppOutboundPayload,
	type XmppRawInbound,
	type XmppSendFn,
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
	bareJid,
	deriveAddresses,
	deriveJid,
	isNostrPubkey,
	normalizeBase64Key,
	normalizeHandle,
	normalizeJidLocalpart,
	normalizeNostrPubkey,
	type ParsedJid,
	parseJid,
	RESERVED_JID_LOCALPARTS,
	ROX_ADDRESS_DOMAIN,
	ROX_XMPP_DOMAIN,
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
	PRESENCE_TTL_MS,
	type RouteInboundResult,
	type RouteOutboundResult,
} from "./router";
export * from "./types";
