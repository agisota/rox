export { AdapterRegistry } from "./AdapterRegistry";
export {
	EmailAdapter,
	type EmailAdapterOptions,
	type EmailAuthResult,
	type EmailAuthVerdict,
	type EmailInboundAttachment,
	type EmailOutboundPayload,
	type EmailRawInbound,
	normalizeSubject,
	type ResendSendFn,
} from "./EmailAdapter";
export { InAppAdapter, type InAppRawMessage } from "./InAppAdapter";
export type {
	SendContext,
	SendResult,
	TransportAdapter,
} from "./TransportAdapter";
export {
	XmppAdapter,
	type XmppAdapterOptions,
	type XmppOutboundPayload,
	type XmppRawInbound,
	type XmppSendFn,
} from "./XmppAdapter";
