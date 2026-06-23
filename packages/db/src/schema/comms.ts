/**
 * Rox Workspace Suite — D1 Identity & Comms Hub (comms-suite epic, P0).
 *
 * The identity spine + unified inbox. One rox handle (`user_profiles.handle`,
 * ROX-522) derives every transport address; a single `comms_threads` row can
 * carry `comms_messages` that arrived/left over different transports (an email
 * reply lands in the same thread as the in-app DM it answers). Sibling comms
 * domains (D2 chat, D3 email, D4 XMPP, D5 mesh) implement the TransportAdapter
 * contract and persist into these tables — they never define their own
 * thread/message spine.
 *
 *   comms_addresses     → every transport address a user owns (derived; aliases)
 *   comms_keypairs      → mesh/E2E PUBLIC key + secret_ref pointer (never the key)
 *   comms_threads       → cross-transport conversation
 *   comms_participants  → who is in a thread (rox user OR external contact node)
 *   comms_messages      → one row per message, any transport
 *   comms_deliveries    → outbound fan-out attempts per recipient/transport
 *   comms_presence      → one merged presence row per user
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ3 — identity is GLOBAL per user (personal `@rox.one` is never siloed per
 *         org). `organization_id` is still carried on every table to match the
 *         repo's Electric shape-filtering convention (`chat_messages`,
 *         `identity_links`); a user's personal threads use their personal org.
 *   DQ4 — a renamed handle's old addresses alias to the new owner for 90 days
 *         then retire; previously-active handles are reserved permanently. The
 *         `is_alias` + `alias_expires_at` columns on `comms_addresses` model
 *         this grace window.
 *
 * Multi-tenant: every table carries `organization_id` and indexes are org-
 * leading so a query that forgets the org filter cannot use the index.
 * Multiplatform: rows live-sync to web/desktop/mobile via ElectricSQL.
 *
 * Additive only — NEVER hand-edit migrations; change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	commsAddressKindValues,
	commsDeliveryStatusValues,
	commsDirectionValues,
	commsParticipantRoleValues,
	commsPresenceStateValues,
	commsTransportValues,
} from "./enums";
import { identityHandles } from "./handles";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const commsAddressKind = pgEnum(
	"comms_address_kind",
	commsAddressKindValues,
);
export const commsTransport = pgEnum("comms_transport", commsTransportValues);
export const commsDirection = pgEnum("comms_direction", commsDirectionValues);
export const commsParticipantRole = pgEnum(
	"comms_participant_role",
	commsParticipantRoleValues,
);
export const commsDeliveryStatus = pgEnum(
	"comms_delivery_status",
	commsDeliveryStatusValues,
);
export const commsPresenceState = pgEnum(
	"comms_presence_state",
	commsPresenceStateValues,
);

// ---------------------------------------------------------------------------
// shared jsonb shapes
// ---------------------------------------------------------------------------

/** Normalized attachment pointer; `url` targets the Drive/R2 object (D8). */
export type CommsAttachment = {
	name: string;
	url: string;
	contentType?: string;
	size?: number;
};

/** Free-form per-message metadata (headers, spam score, transport extras). */
export type CommsMessageMetadata = Record<string, unknown>;

/** Per-transport presence snapshot merged into the aggregate `state`. */
export type CommsPerTransportPresence = Record<
	string,
	{ state?: string; at?: string; lastSeenAt?: string }
>;

// ---------------------------------------------------------------------------
// comms_addresses — every transport address a user owns (derived from handle)
// ---------------------------------------------------------------------------

export const commsAddresses = pgTable(
	"comms_addresses",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		kind: commsAddressKind().notNull(),
		// Normalized: email/JID lowercased; mesh = hex/npub pubkey.
		value: text().notNull(),

		// Current handle-derived address vs a retained alias after a rename (DQ4).
		isPrimary: boolean("is_primary").notNull().default(true),
		isAlias: boolean("is_alias").notNull().default(false),
		// When an alias stops resolving to this owner (DQ4: 90-day grace). Null for
		// a primary address; set on rename for the old address.
		aliasExpiresAt: timestamp("alias_expires_at", { withTimezone: true }),
		verified: boolean().notNull().default(false),

		// Join key to the reservation registry (DQ4); nullable, lazily backfilled.
		handleId: uuid("handle_id").references(() => identityHandles.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One address resolves to one owner per org (DQ4 permanent reservation is
		// enforced at the service layer; this guards live duplicates).
		uniqueIndex("comms_addresses_org_kind_value_uniq").on(
			t.organizationId,
			t.kind,
			t.value,
		),
		// GLOBAL: exactly one LIVE primary per (kind, value) across all orgs (S2;
		// mirrors mail_addresses_address_uniq). Aliases excluded so a renamed
		// owner's old value coexists as an alias alongside the new primary.
		uniqueIndex("comms_addresses_kind_value_primary_uniq")
			.on(t.kind, t.value)
			.where(sql`${t.isAlias} = false`),
		index("comms_addresses_user_idx").on(t.userId),
		// Fast inbound lookup: given a (kind, value), find the owner.
		index("comms_addresses_kind_value_idx").on(t.kind, t.value),
	],
);

export type InsertCommsAddress = typeof commsAddresses.$inferInsert;
export type SelectCommsAddress = typeof commsAddresses.$inferSelect;

// ---------------------------------------------------------------------------
// comms_keypairs — mesh/E2E PUBLIC key + secret pointer (private key NEVER here)
// ---------------------------------------------------------------------------

export const commsKeypairs = pgTable(
	"comms_keypairs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		algo: text().notNull().default("ed25519"),
		publicKey: text("public_key").notNull(), // hex
		// Pointer into the secret store (Infisical / host keystore). NEVER the raw
		// private key — that lives only in expo-secure-store / Electron safeStorage.
		secretRef: text("secret_ref"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [uniqueIndex("comms_keypairs_user_algo_uniq").on(t.userId, t.algo)],
);

export type InsertCommsKeypair = typeof commsKeypairs.$inferInsert;
export type SelectCommsKeypair = typeof commsKeypairs.$inferSelect;

// ---------------------------------------------------------------------------
// comms_threads — a conversation that may span transports
// ---------------------------------------------------------------------------

export const commsThreads = pgTable(
	"comms_threads",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		subject: text(), // derived from first email subject / chat title
		lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
		// Normalized key for cross-transport thread matching (RFC References/
		// In-Reply-To root, or sorted-participant hash). Never merge across orgs.
		dedupKey: text("dedup_key"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Inbox feed: a user's org threads newest-first (org-leading per convention).
		index("comms_threads_org_last_message_idx").on(
			t.organizationId,
			t.lastMessageAt,
		),
		index("comms_threads_org_dedup_idx").on(t.organizationId, t.dedupKey),
		// Find-or-create backstop: at most ONE thread per (org, dedup_key) so two
		// concurrent emit paths (mail/mesh/xmpp/in-app) racing the SELECT-then-INSERT
		// collapse onto a single thread instead of forking duplicates. Partial so
		// dedup-less threads (NULL key) are never constrained.
		uniqueIndex("comms_threads_org_dedup_uniq")
			.on(t.organizationId, t.dedupKey)
			.where(sql`${t.dedupKey} IS NOT NULL`),
	],
);

export type InsertCommsThread = typeof commsThreads.$inferInsert;
export type SelectCommsThread = typeof commsThreads.$inferSelect;

// ---------------------------------------------------------------------------
// comms_participants — who is in a thread (rox user OR external contact)
// ---------------------------------------------------------------------------

export const commsParticipants = pgTable(
	"comms_participants",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		threadId: uuid("thread_id")
			.notNull()
			.references(() => commsThreads.id, { onDelete: "cascade" }),

		// Set when the participant is a rox user.
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		// External counterpart → identity_links.contact_entity_id (D6). Loose ref
		// (no FK): identity_links resolves the contact node lazily.
		contactEntityId: uuid("contact_entity_id"),

		role: commsParticipantRole().notNull().default("member"),
		// Unread tracking: last message this participant has read. Loose ref to a
		// comms_messages id (no FK so deleting a message doesn't cascade-detach).
		lastReadMessageId: uuid("last_read_message_id"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// A rox user appears at most once per thread (partial: only where user set).
		uniqueIndex("comms_participants_thread_user_uniq")
			.on(t.threadId, t.userId)
			.where(sql`${t.userId} IS NOT NULL`),
		index("comms_participants_thread_idx").on(t.threadId),
		index("comms_participants_user_idx").on(t.userId),
	],
);

export type InsertCommsParticipant = typeof commsParticipants.$inferInsert;
export type SelectCommsParticipant = typeof commsParticipants.$inferSelect;

// ---------------------------------------------------------------------------
// comms_messages — one row per message, regardless of transport
//
// Edit/tombstone semantics (T8/M): `edited_at` stamps the last in-app edit
// (null = never edited); `deleted_at` is a soft-delete tombstone (null = live).
// A deleted row is KEPT (audit/restore) — the read procs withhold its body.
// ---------------------------------------------------------------------------

export const commsMessages = pgTable(
	"comms_messages",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		threadId: uuid("thread_id")
			.notNull()
			.references(() => commsThreads.id, { onDelete: "cascade" }),

		transport: commsTransport().notNull(),
		direction: commsDirection().notNull(),

		// Set if a rox user authored; else an external author (D6 contact node).
		authorUserId: uuid("author_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		authorContactEntityId: uuid("author_contact_entity_id"),

		// Provider/transport message id (email Message-ID, XMPP stanza id, Nostr
		// event id) — for idempotent inbound dedup. Null for some outbound drafts.
		externalId: text("external_id"),
		inReplyToExternalId: text("in_reply_to_external_id"),

		body: text().notNull().default(""), // normalized plaintext/markdown
		bodyHtml: text("body_html"), // original email HTML if any
		attachments: jsonb().$type<CommsAttachment[]>().notNull().default([]),
		metadata: jsonb().$type<CommsMessageMetadata>().notNull().default({}),

		// Message time (provider-reported when inbound).
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		// Hub ingestion time.
		receivedAt: timestamp("received_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		// Last in-app edit time (T8/M). Null = never edited; the UI shows an
		// "(edited)" marker when set. Additive nullable — backward compatible.
		editedAt: timestamp("edited_at", { withTimezone: true }),
		// Soft-delete tombstone (T8/M). Null = live; set = deleted. The row is kept
		// (audit/restore) and the read procs withhold its body. Additive nullable.
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		// Thread read: a thread's messages in order, org-leading.
		index("comms_messages_org_thread_created_idx").on(
			t.organizationId,
			t.threadId,
			t.createdAt,
		),
		// Inbound idempotency: one row per (transport, external_id) where present.
		uniqueIndex("comms_messages_transport_external_uniq")
			.on(t.transport, t.externalId)
			.where(sql`${t.externalId} IS NOT NULL`),
		index("comms_messages_author_idx").on(t.authorUserId),
	],
);

export type InsertCommsMessage = typeof commsMessages.$inferInsert;
export type SelectCommsMessage = typeof commsMessages.$inferSelect;

// ---------------------------------------------------------------------------
// comms_deliveries — outbound delivery attempts per recipient/transport
// ---------------------------------------------------------------------------

export const commsDeliveries = pgTable(
	"comms_deliveries",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		messageId: uuid("message_id")
			.notNull()
			.references(() => commsMessages.id, { onDelete: "cascade" }),

		transport: commsTransport().notNull(),
		toAddress: text("to_address").notNull(),
		status: commsDeliveryStatus().notNull().default("queued"),
		providerId: text("provider_id"), // provider message id once sent
		error: text(),
		attempts: integer().notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("comms_deliveries_message_idx").on(t.messageId),
		index("comms_deliveries_org_status_idx").on(t.organizationId, t.status),
	],
);

export type InsertCommsDelivery = typeof commsDeliveries.$inferInsert;
export type SelectCommsDelivery = typeof commsDeliveries.$inferSelect;

// ---------------------------------------------------------------------------
// comms_presence — merged presence, one row per rox user
// ---------------------------------------------------------------------------

export const commsPresence = pgTable(
	"comms_presence",
	{
		userId: uuid("user_id")
			.primaryKey()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		state: commsPresenceState().notNull().default("offline"),
		// `{inapp:{state,at}, xmpp:{...}, email:{lastSeenAt}}` — last-write per
		// transport, aggregated into `state`.
		perTransport: jsonb("per_transport")
			.$type<CommsPerTransportPresence>()
			.notNull()
			.default({}),
		statusText: text("status_text"),

		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("comms_presence_org_state_idx").on(t.organizationId, t.state)],
);

export type InsertCommsPresence = typeof commsPresence.$inferInsert;
export type SelectCommsPresence = typeof commsPresence.$inferSelect;
