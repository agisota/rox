/**
 * Rox Workspace Suite — D3 Per-User Email (comms-suite epic, P3).
 *
 * Every user owns one externally-reachable mailbox at `<handle>@rox.one`,
 * derived 1:1 from `user_profiles.handle` (ROX-522). INBOUND mail is ingested
 * by a Cloudflare Email Worker that streams the raw `.eml` + attachments to R2
 * (Drive/D8) and POSTs a signed envelope to `/api/mail/inbound`; OUTBOUND is
 * sent through Resend as `<handle>@rox.one`. The `mail_*` tables here store ONLY
 * structured metadata + R2 object pointers — bodies/attachments never live
 * inline. Accepted, non-quarantined inbound is ALSO emitted into the unified
 * inbox (D1, `comms_messages` with transport = `email`) so D3 feeds D1 without
 * owning the cross-transport thread spine.
 *
 *   mail_addresses    → the routable identity, 1:1 with handle (+ renamed aliases)
 *   mail_threads      → conversation grouping (RFC References / subject-normalized)
 *   mail_messages     → one row per inbound/outbound message (envelope only)
 *   mail_attachments  → per-attachment metadata, content in Drive/D8 (R2)
 *   mail_events       → raw provider webhook/delivery log (audit + webhook dedup)
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ1 — Cloudflare R2 is the body/attachment store; `mail_messages.raw_blob_key`
 *         et al. are object keys, never inline bodies.
 *   DQ2 — mail attachments count toward the single shared 10 GiB Drive quota;
 *         overage soft-meters into the WS-E ledger (handled by D8, not here).
 *   DQ3 — the mailbox is GLOBAL per user (personal `@rox.one` is never siloed per
 *         org). `organization_id` is still carried on every table to match the
 *         repo's Electric shape-filtering convention; personal mail uses the
 *         user's personal org.
 *   DQ4 — a renamed handle's old address aliases to the new owner for 90 days
 *         (`kind='alias'`, `status='grace'`, `grace_until`) then retires;
 *         previously-active addresses are reserved permanently (service layer).
 *
 * Multi-tenant: every table carries `organization_id`. Ownership keys are
 * `auth.users(id)` (UUID, stable across handle renames). Multiplatform: rows
 * live-sync to web/desktop/mobile via ElectricSQL.
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
	mailAddressKindValues,
	mailAddressStatusValues,
	mailDirectionValues,
	mailProviderValues,
	mailStatusValues,
} from "./enums";
import { identityHandles } from "./handles";

/** The canonical sending/receiving domain for derived rox mailboxes. */
export const ROX_MAIL_DOMAIN = "rox.one";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const mailAddressKind = pgEnum(
	"mail_address_kind",
	mailAddressKindValues,
);
export const mailAddressStatus = pgEnum(
	"mail_address_status",
	mailAddressStatusValues,
);
export const mailDirection = pgEnum("mail_direction", mailDirectionValues);
export const mailStatus = pgEnum("mail_status", mailStatusValues);
export const mailProvider = pgEnum("mail_provider", mailProviderValues);

// ---------------------------------------------------------------------------
// shared jsonb shapes
// ---------------------------------------------------------------------------

/** Free-form per-event provider payload (Resend webhook body, CF metadata). */
export type MailEventPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// mail_addresses — the routable identity, 1:1 with handle (+ renamed aliases)
// ---------------------------------------------------------------------------

export const mailAddresses = pgTable(
	"mail_addresses",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// '<handle>' normalized lowercase; the handle IS the local part (no second
		// namespace). `address` is the stored normalized `local_part@domain`.
		localPart: text("local_part").notNull(),
		domain: text().notNull().default(ROX_MAIL_DOMAIN),
		address: text().notNull(),

		kind: mailAddressKind().notNull().default("primary"),
		status: mailAddressStatus().notNull().default("active"),
		// For renamed-handle aliases (DQ4: 90-day grace). Null for a primary.
		graceUntil: timestamp("grace_until", { withTimezone: true }),

		// Join key to the reservation registry (DQ4); nullable, lazily backfilled.
		handleId: uuid("handle_id").references(() => identityHandles.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Global: one owner per address (DQ4 permanent reservation enforced at the
		// service layer; this guards live duplicates across all orgs).
		uniqueIndex("mail_addresses_address_uniq").on(t.address),
		index("mail_addresses_user_idx").on(t.userId),
		index("mail_addresses_org_idx").on(t.organizationId),
	],
);

export type InsertMailAddress = typeof mailAddresses.$inferInsert;
export type SelectMailAddress = typeof mailAddresses.$inferSelect;

// ---------------------------------------------------------------------------
// mail_threads — conversation grouping (RFC References / subject-normalized)
// ---------------------------------------------------------------------------

export const mailThreads = pgTable(
	"mail_threads",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		rootMessageRef: text("root_message_ref"), // first Message-ID seen
		// Subject with re:/fwd: stripped, for fallback grouping when no References.
		subjectNorm: text("subject_norm"),
		lastMessageAt: timestamp("last_message_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		messageCount: integer("message_count").notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Inbox feed: a user's threads newest-first.
		index("mail_threads_owner_last_idx").on(t.ownerUserId, t.lastMessageAt),
		index("mail_threads_org_idx").on(t.organizationId),
	],
);

export type InsertMailThread = typeof mailThreads.$inferInsert;
export type SelectMailThread = typeof mailThreads.$inferSelect;

// ---------------------------------------------------------------------------
// mail_messages — one row per inbound/outbound message (envelope only)
// ---------------------------------------------------------------------------

export const mailMessages = pgTable(
	"mail_messages",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id") // the rox mailbox owner
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		addressId: uuid("address_id").references(() => mailAddresses.id, {
			onDelete: "set null",
		}),
		threadId: uuid("thread_id").references(() => mailThreads.id, {
			onDelete: "cascade",
		}),

		direction: mailDirection().notNull(),
		status: mailStatus().notNull(),

		// Message-ID header (for threading + dedup); null for some outbound drafts.
		rfcMessageId: text("rfc_message_id"),
		inReplyTo: text("in_reply_to"),
		referencesIds: text("references_ids").array(),

		fromAddr: text("from_addr").notNull(),
		fromName: text("from_name"),
		toAddrs: text("to_addrs").array().notNull(),
		ccAddrs: text("cc_addrs").array().default(sql`'{}'`),
		bccAddrs: text("bcc_addrs").array().default(sql`'{}'`),
		replyTo: text("reply_to"),
		subject: text(),
		// First ~200 chars plaintext, for list view (NO body here — body in R2).
		snippet: text(),

		rawBlobKey: text("raw_blob_key"), // D8/R2 object key for the full .eml
		bodyTextKey: text("body_text_key"), // R2 key for extracted text/plain
		bodyHtmlKey: text("body_html_key"), // R2 key for sanitized text/html

		hasAttachments: boolean("has_attachments").notNull().default(false),
		hasCalendarInvite: boolean("has_calendar_invite").notNull().default(false),

		spamScore: integer("spam_score"), // 0..100; >= threshold ⇒ quarantined
		spfPass: boolean("spf_pass"),
		dkimPass: boolean("dkim_pass"),
		dmarcPass: boolean("dmarc_pass"),

		provider: mailProvider().notNull(),
		providerEventId: text("provider_event_id"), // Resend email_id / CF message id

		isRead: boolean("is_read").notNull().default(false),
		receivedAt: timestamp("received_at", { withTimezone: true }),
		sentAt: timestamp("sent_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Idempotent ingest: one row per (owner, Message-ID) where present.
		uniqueIndex("mail_messages_owner_msgid_uniq")
			.on(t.ownerUserId, t.rfcMessageId)
			.where(sql`${t.rfcMessageId} IS NOT NULL`),
		index("mail_messages_owner_received_idx").on(t.ownerUserId, t.receivedAt),
		index("mail_messages_thread_idx").on(t.threadId),
		index("mail_messages_status_idx").on(t.status),
		index("mail_messages_org_idx").on(t.organizationId),
	],
);

export type InsertMailMessage = typeof mailMessages.$inferInsert;
export type SelectMailMessage = typeof mailMessages.$inferSelect;

// ---------------------------------------------------------------------------
// mail_attachments — per-attachment metadata, content in Drive/D8 (R2)
// ---------------------------------------------------------------------------

export const mailAttachments = pgTable(
	"mail_attachments",
	{
		id: uuid().primaryKey().defaultRandom(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => mailMessages.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		filename: text().notNull(),
		contentType: text("content_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		contentId: text("content_id"), // for inline (cid:) references
		isInline: boolean("is_inline").notNull().default(false),
		blobKey: text("blob_key").notNull(), // D8/R2 object key
		// FK to a D8 drive_files row when the attachment is promoted to Drive.
		driveFileId: uuid("drive_file_id"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("mail_attachments_message_idx").on(t.messageId),
		index("mail_attachments_org_idx").on(t.organizationId),
	],
);

export type InsertMailAttachment = typeof mailAttachments.$inferInsert;
export type SelectMailAttachment = typeof mailAttachments.$inferSelect;

// ---------------------------------------------------------------------------
// mail_events — raw provider webhook/delivery log (audit + webhook dedup)
// ---------------------------------------------------------------------------

export const mailEvents = pgTable(
	"mail_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		messageId: uuid("message_id").references(() => mailMessages.id, {
			onDelete: "set null",
		}),

		provider: mailProvider().notNull(),
		// received|delivered|bounced|complained|delivery_delayed...
		eventType: text("event_type").notNull(),
		providerEventId: text("provider_event_id"),
		payload: jsonb().$type<MailEventPayload>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Webhook dedup: one row per (provider, provider_event_id) where present.
		uniqueIndex("mail_events_provider_evt_uniq")
			.on(t.provider, t.providerEventId)
			.where(sql`${t.providerEventId} IS NOT NULL`),
		index("mail_events_message_idx").on(t.messageId),
	],
);

export type InsertMailEvent = typeof mailEvents.$inferInsert;
export type SelectMailEvent = typeof mailEvents.$inferSelect;

// ---------------------------------------------------------------------------
// mail_nonces — single-use replay guard for the inbound webhook (D3)
// ---------------------------------------------------------------------------

/**
 * Each signed Cloudflare Email Worker POST to `/api/mail/inbound` carries a
 * one-time nonce inside the timestamp-skew window. The per-process in-memory set
 * does not hold across horizontally-scaled API instances, so the DB is the
 * source of truth: a nonce is consumed by INSERT, and a unique-constraint
 * violation on the primary key means the nonce was already seen ⇒ replay.
 *
 * `expires_at` bounds retention to the skew window so a periodic/opportunistic
 * prune keeps the table tiny. Additive, infra-only — no FK, no org scoping
 * (the nonce is global to the webhook, not tenant data).
 */
export const mailNonces = pgTable(
	"mail_nonces",
	{
		nonce: text().primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Prune sweep: delete rows past their expiry cheaply.
		index("mail_nonces_expires_idx").on(t.expiresAt),
	],
);

export type InsertMailNonce = typeof mailNonces.$inferInsert;
export type SelectMailNonce = typeof mailNonces.$inferSelect;
