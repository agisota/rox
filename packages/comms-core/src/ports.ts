/**
 * @rox/comms-core — persistence ports.
 *
 * Every database touch the router/adapters need is expressed as a narrow,
 * injected interface. The real implementation (Drizzle against Neon) lives in
 * the API/server layer; here we only depend on the contract, so the domain
 * logic unit-tests with in-memory fakes and never imports a db client.
 */

import type {
	CommsAddress,
	CommsAttachment,
	CommsDelivery,
	CommsDeliveryStatus,
	CommsDirection,
	CommsMessage,
	CommsMessageMetadata,
	CommsParticipant,
	CommsParticipantRole,
	CommsPresence,
	CommsThread,
	CommsTransport,
	Counterpart,
} from "./types";

/** Resolve a transport address to its owning rox user (within an org). */
export interface AddressStore {
	/**
	 * Find the address row for `(organizationId, kind?, value)`. Matches both
	 * primary and alias addresses (alias hits resolve to the current owner).
	 */
	findByValue(args: {
		organizationId: string;
		value: string;
		kind?: CommsTransport;
	}): Promise<CommsAddress | null>;
}

/**
 * Find-or-create an external counterpart as a contact node, reusing the D6
 * `identity_links` resolution. Returns the contact entity id.
 */
export interface ContactResolver {
	resolveContact(args: {
		organizationId: string;
		/** Identity kind, e.g. `email`, that the contact is keyed by. */
		kind: CommsTransport;
		value: string;
	}): Promise<{ contactEntityId: string }>;
}

/** Read/write `comms_threads` + `comms_participants`. */
export interface ThreadStore {
	/** Find a thread by its normalized cross-transport dedup key. */
	findByDedupKey(args: {
		organizationId: string;
		dedupKey: string;
	}): Promise<CommsThread | null>;

	/** Find the thread that owns a message with the given external id. */
	findThreadByMessageExternalId(args: {
		organizationId: string;
		transport: CommsTransport;
		externalId: string;
	}): Promise<CommsThread | null>;

	/** Create a thread with its initial participants. */
	createThread(args: {
		organizationId: string;
		subject: string | null;
		dedupKey: string | null;
		participants: Array<{
			userId: string | null;
			contactEntityId: string | null;
			role: CommsParticipantRole;
		}>;
	}): Promise<CommsThread>;

	/** Add participants not already present (idempotent on `(thread,user)`). */
	addParticipants(args: {
		threadId: string;
		organizationId: string;
		participants: Array<{
			userId: string | null;
			contactEntityId: string | null;
			role: CommsParticipantRole;
		}>;
	}): Promise<CommsParticipant[]>;

	/** Bump `last_message_at` for inbox ordering. */
	touchLastMessageAt(args: { threadId: string; at: Date }): Promise<void>;
}

/** Read/write `comms_messages` with `(transport, external_id)` idempotency. */
export interface MessageStore {
	/** Lookup for inbound dedup — returns the existing row if any. */
	findByExternalId(args: {
		transport: CommsTransport;
		externalId: string;
	}): Promise<CommsMessage | null>;

	/** Insert a message row. */
	insert(args: {
		organizationId: string;
		threadId: string;
		transport: CommsTransport;
		direction: CommsDirection;
		authorUserId: string | null;
		authorContactEntityId: string | null;
		externalId: string | null;
		inReplyToExternalId: string | null;
		body: string;
		bodyHtml: string | null;
		attachments: CommsAttachment[];
		metadata: CommsMessageMetadata;
		createdAt: Date;
	}): Promise<CommsMessage>;
}

/** Write `comms_deliveries` rows for outbound fan-out. */
export interface DeliveryStore {
	insert(args: {
		organizationId: string;
		messageId: string;
		transport: CommsTransport;
		toAddress: string;
		status: CommsDeliveryStatus;
	}): Promise<CommsDelivery>;

	updateStatus(args: {
		deliveryId: string;
		status: CommsDeliveryStatus;
		providerId?: string | null;
		error?: string | null;
	}): Promise<void>;
}

/** Read merged presence for transport selection. */
export interface PresenceStore {
	get(args: {
		organizationId: string;
		userId: string;
	}): Promise<CommsPresence | null>;
}

/** Optional org-membership guard (defense-in-depth for non-tRPC callers). */
export interface MembersStore {
	assertMember(args: { organizationId: string; userId: string }): Promise<void>;
}

/** The full set of ports the {@link MessageRouter} depends on. */
export interface CommsPorts {
	addresses: AddressStore;
	contacts: ContactResolver;
	threads: ThreadStore;
	messages: MessageStore;
	deliveries: DeliveryStore;
	presence: PresenceStore;
	/** Optional: when present, resolveCounterpart verifies userId recipients. */
	members?: MembersStore;
}

/** A resolved recipient ready for delivery. */
export interface ResolvedRecipient {
	counterpart: Counterpart;
	transport: CommsTransport;
	toAddress: string;
}
