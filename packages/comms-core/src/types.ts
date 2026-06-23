/**
 * @rox/comms-core — domain types for the Identity & Comms Hub (D1).
 *
 * These mirror the `comms_*` schema shapes described in
 * `plans/rox-comms-suite/D1-identity-hub-spec.md` but are declared as pure
 * TypeScript so this package carries NO database dependency at runtime. The
 * real Drizzle tables (a separate WS-COMMS schema wave) infer-derive the same
 * enums; the value arrays here are the single source the schema must match.
 *
 * Persistence is never performed in this package — every store is an injected
 * port (see `./ports.ts`), so the router/adapters unit-test without a database.
 */

// ---------------------------------------------------------------------------
// Enum value arrays (must match packages/db comms.ts pgEnum definitions)
// ---------------------------------------------------------------------------

/** Transport address kinds derived from a rox handle. */
export const commsAddressKindValues = [
	"email",
	"xmpp",
	"mesh",
	"inapp",
] as const;
export type CommsAddressKind = (typeof commsAddressKindValues)[number];

/** Transport a message arrived/left through. */
export const commsTransportValues = ["inapp", "email", "xmpp", "mesh"] as const;
export type CommsTransport = (typeof commsTransportValues)[number];

/** Direction of a message relative to the hub. */
export const commsDirectionValues = ["inbound", "outbound"] as const;
export type CommsDirection = (typeof commsDirectionValues)[number];

/** Role of a participant within a thread. */
export const commsParticipantRoleValues = ["owner", "member"] as const;
export type CommsParticipantRole = (typeof commsParticipantRoleValues)[number];

/** Per-recipient outbound delivery status. */
export const commsDeliveryStatusValues = [
	"queued",
	"sent",
	"delivered",
	"failed",
	"bounced",
] as const;
export type CommsDeliveryStatus = (typeof commsDeliveryStatusValues)[number];

/** Aggregate presence state for a rox user. */
export const commsPresenceStateValues = [
	"online",
	"away",
	"dnd",
	"offline",
] as const;
export type CommsPresenceState = (typeof commsPresenceStateValues)[number];

// ---------------------------------------------------------------------------
// Free-form metadata shapes (jsonb columns in the schema)
// ---------------------------------------------------------------------------

/** Headers, spam score, transport-specific extras. */
export type CommsMessageMetadata = Record<string, unknown>;

/** A message attachment pointer — `url` references the Drive/R2 bucket. */
export interface CommsAttachment {
	name: string;
	url: string;
	contentType: string;
	size: number;
}

// ---------------------------------------------------------------------------
// Identity / address shapes
// ---------------------------------------------------------------------------

/** A transport address owned by a rox user, derived from their handle. */
export interface CommsAddress {
	id: string;
	organizationId: string;
	userId: string;
	kind: CommsAddressKind;
	/** Normalized value: email/JID lowercased; mesh = hex/npub pubkey. */
	value: string;
	isPrimary: boolean;
	isAlias: boolean;
	verified: boolean;
}

/** Addresses derived from a single handle (mesh pubkey filled by adapter). */
export interface DerivedAddresses {
	handle: string;
	email: string;
	xmpp: string;
	/** Mesh pubkey is provisioned by the mesh adapter, not derivable from the handle alone. */
	mesh: string | null;
}

// ---------------------------------------------------------------------------
// Thread / message / participant shapes
// ---------------------------------------------------------------------------

/** A conversation that may span transports. */
export interface CommsThread {
	id: string;
	organizationId: string;
	subject: string | null;
	lastMessageAt: Date | null;
	/** Normalized key for cross-transport thread matching. */
	dedupKey: string | null;
}

/** A participant in a thread — a rox user OR an external contact. */
export interface CommsParticipant {
	id: string;
	organizationId: string;
	threadId: string;
	/** Set when the participant is a rox user. */
	userId: string | null;
	/** External counterpart → `identity_links.contact_entity_id` (D6). */
	contactEntityId: string | null;
	role: CommsParticipantRole;
	lastReadMessageId: string | null;
}

/** One persisted message, regardless of transport. */
export interface CommsMessage {
	id: string;
	organizationId: string;
	threadId: string;
	transport: CommsTransport;
	direction: CommsDirection;
	authorUserId: string | null;
	authorContactEntityId: string | null;
	/** Provider/transport message id — used for idempotent inbound dedup. */
	externalId: string | null;
	inReplyToExternalId: string | null;
	body: string;
	bodyHtml: string | null;
	attachments: CommsAttachment[];
	metadata: CommsMessageMetadata;
	createdAt: Date;
	receivedAt: Date;
}

/** Per-recipient outbound delivery attempt. */
export interface CommsDelivery {
	id: string;
	organizationId: string;
	messageId: string;
	transport: CommsTransport;
	toAddress: string;
	status: CommsDeliveryStatus;
	providerId: string | null;
	error: string | null;
	attempts: number;
}

/** Merged presence — one record per rox user. */
export interface CommsPresence {
	userId: string;
	organizationId: string;
	state: CommsPresenceState;
	perTransport: PerTransportPresence;
	statusText: string | null;
	updatedAt: Date;
}

/** Last-write presence per transport feeding the aggregate `state`. */
export type PerTransportPresence = Partial<
	Record<CommsTransport, { state?: CommsPresenceState; at?: string }>
>;

// ---------------------------------------------------------------------------
// Transport-neutral message shapes (the adapter contract currency)
// ---------------------------------------------------------------------------

/** A resolved counterparty — either a rox user or an external contact. */
export type Counterpart =
	| {
			type: "user";
			organizationId: string;
			userId: string;
			/** The address the counterpart was resolved from, if any. */
			address?: string;
	  }
	| {
			type: "contact";
			organizationId: string;
			contactEntityId: string;
			address: string;
	  };

/** An inbound message after an adapter has normalized the raw provider payload. */
export interface NormalizedMessage {
	transport: CommsTransport;
	/** Provider/transport message id, for `(transport, external_id)` dedup. */
	externalId: string | null;
	inReplyToExternalId: string | null;
	/** Sender address (email/JID/pubkey), normalized lowercase where applicable. */
	from: string;
	/** Recipient addresses. */
	to: string[];
	subject: string | null;
	body: string;
	bodyHtml: string | null;
	attachments: CommsAttachment[];
	/** Provider-reported message time. */
	createdAt: Date;
	metadata: CommsMessageMetadata;
}

/** An outbound message draft handed to the router for fan-out. */
export interface OutboundDraft {
	organizationId: string;
	/** Author (a rox user composing the message). */
	authorUserId: string;
	/** Existing thread to append to, if known. */
	threadId?: string;
	/** Recipients, by address or rox user id. */
	recipients: RecipientRef[];
	subject?: string | null;
	body: string;
	bodyHtml?: string | null;
	attachments?: CommsAttachment[];
	/** Optional transport override per recipient is resolved by `selectTransport`. */
	metadata?: CommsMessageMetadata;
}

/** A recipient reference — resolve to a counterpart + transport before send. */
export type RecipientRef =
	| { kind: "userId"; userId: string }
	| { kind: "address"; address: string };
