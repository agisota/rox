/**
 * Rox Workspace Suite — D4 XMPP / Jabber Federation (comms-suite epic, P0).
 *
 * Makes the locked rox identity (`user_profiles.handle`, ROX-522) reachable on
 * the global XMPP/Jabber network as `<handle>@xmpp.rox.one`, and lets external
 * Jabber users talk to rox users through a bridge into the D1 unified inbox.
 *
 * A self-hosted ejabberd (authored in the deploy wave, NOT here) owns the XMPP
 * domain, s2s federation, TLS, and dialback; an XEP-0114 component relays
 * stanzas to/from the D1 hub. The `xmpp_*` tables below are the ONLY
 * Drizzle-owned additions and they describe the *Rox↔XMPP mapping* — JID
 * bindings, renamed-handle aliases, remote-contact roster links, an offline
 * relay buffer, and per-domain federation policy. ejabberd's own SQL schema
 * (roster, MAM, offline, vcard) lives in a SEPARATE ejabberd-managed database
 * and is never modelled here.
 *
 *   xmpp_accounts          → one provisioned JID per user, 1:1 with the handle
 *   xmpp_jid_aliases       → renamed/reserved localparts (DQ4 grace + permanent)
 *   xmpp_roster_links      → maps a remote JID contact to a Rox contact node
 *   xmpp_offline_queue     → transient store-and-forward relay buffer (TTL'd)
 *   xmpp_federation_policy → per remote-domain allow/deny/throttle
 *   xmpp_nonces            → single-use replay guard for the bridge ingress
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ3 — identity is GLOBAL per user; the JID belongs to the person, not an
 *         org. `organization_id` is still stamped (Electric shape convention)
 *         using the user's personal/active org, never siloing the JID.
 *   DQ4 — a renamed handle's old JID aliases to the new owner for 90 days
 *         (`xmpp_jid_aliases.reserved_until`) then retires; previously-active
 *         localparts are reserved PERMANENTLY (never reassigned). Applies
 *         atomically across D1 identity + D3 email + D4 XMPP.
 *
 * Multi-tenant: every owned table carries `organization_id` and indexes are
 * org/owner-leading. Multiplatform: rows live-sync to web/desktop/mobile via
 * ElectricSQL.
 *
 * Bodies of bridged conversations are NOT primarily stored here — that content
 * is owned by the D1 hub (`comms_messages`, transport = `xmpp`). The offline
 * queue is a transient relay buffer only.
 *
 * Additive only — NEVER hand-edit migrations; change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
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
	xmppAccountStatusValues,
	xmppDirectionValues,
	xmppFedPolicyValues,
	xmppSubscriptionValues,
} from "./enums";

/** The canonical XMPP service domain for derived rox JIDs. */
export const ROX_XMPP_DOMAIN = "xmpp.rox.one";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const xmppAccountStatus = pgEnum(
	"xmpp_account_status",
	xmppAccountStatusValues,
);
export const xmppSubscription = pgEnum(
	"xmpp_subscription",
	xmppSubscriptionValues,
);
export const xmppDirection = pgEnum("xmpp_direction", xmppDirectionValues);
export const xmppFedPolicy = pgEnum("xmpp_fed_policy", xmppFedPolicyValues);

// ---------------------------------------------------------------------------
// shared jsonb shapes
// ---------------------------------------------------------------------------

/** A normalized stanza buffered for store-and-forward (body, thread, ids). */
export type XmppStanzaPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// xmpp_accounts — one provisioned JID per user, 1:1 with the rox handle
// ---------------------------------------------------------------------------

export const xmppAccounts = pgTable(
	"xmpp_accounts",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Folded handle (RFC 7622 JID-escaped localpart), e.g. "alice".
		jidLocalpart: text("jid_localpart").notNull(),
		domain: text().notNull().default(ROX_XMPP_DOMAIN),

		status: xmppAccountStatus().notNull().default("active"),
		// Optional pinned-resource rules (e.g. force a bridge resource). Reserved
		// for the deploy-wave bridge; null in P0.
		resourcePolicy: text("resource_policy"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Global JID uniqueness: one owner per `localpart@domain` across all orgs
		// (DQ4 permanent reservation enforced at the service layer; this guards
		// live duplicates).
		uniqueIndex("xmpp_accounts_domain_localpart_uniq").on(
			t.domain,
			t.jidLocalpart,
		),
		// One JID per user.
		uniqueIndex("xmpp_accounts_user_uniq").on(t.userId),
		index("xmpp_accounts_user_idx").on(t.userId),
		index("xmpp_accounts_org_idx").on(t.organizationId),
	],
);

export type InsertXmppAccount = typeof xmppAccounts.$inferInsert;
export type SelectXmppAccount = typeof xmppAccounts.$inferSelect;

// ---------------------------------------------------------------------------
// xmpp_jid_aliases — renamed/reserved localparts (DQ4 grace + permanent reserve)
// ---------------------------------------------------------------------------

export const xmppJidAliases = pgTable(
	"xmpp_jid_aliases",
	{
		id: uuid().primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => xmppAccounts.id, { onDelete: "cascade" }),

		// The old localpart freed by a rename. Folded the same way as the live
		// localpart so an alias can never collide with an active JID.
		jidLocalpart: text("jid_localpart").notNull(),
		// 90-day grace window after a rename: inside it the alias routes to the new
		// owner; after it the alias retires (but the localpart stays reserved
		// permanently — never reassigned, enforced at the service layer). Null = a
		// permanent reservation with no active routing.
		reservedUntil: timestamp("reserved_until", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// An alias localpart is globally unique so it can't collide with a live
		// localpart or another alias.
		uniqueIndex("xmpp_jid_aliases_localpart_uniq").on(t.jidLocalpart),
		index("xmpp_jid_aliases_account_idx").on(t.accountId),
	],
);

export type InsertXmppJidAlias = typeof xmppJidAliases.$inferInsert;
export type SelectXmppJidAlias = typeof xmppJidAliases.$inferSelect;

// ---------------------------------------------------------------------------
// xmpp_roster_links — map a remote JID contact to a Rox contact node
// (bridges into identity_links / contacts; NOT a second roster store)
// ---------------------------------------------------------------------------

export const xmppRosterLinks = pgTable(
	"xmpp_roster_links",
	{
		id: uuid().primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => xmppAccounts.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// The remote bare JID (`bob@external.org`), normalized lowercase.
		remoteJid: text("remote_jid").notNull(),
		// Loose ref to identity_links.contact_entity_id (D6) — no FK; identity_links
		// resolves the contact node lazily (kind = `xmpp`).
		contactEntityId: uuid("contact_entity_id"),
		subscription: xmppSubscription().notNull().default("none"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One roster row per (account, remote JID).
		uniqueIndex("xmpp_roster_links_account_remote_uniq").on(
			t.accountId,
			t.remoteJid,
		),
		index("xmpp_roster_links_account_idx").on(t.accountId),
		index("xmpp_roster_links_org_idx").on(t.organizationId),
	],
);

export type InsertXmppRosterLink = typeof xmppRosterLinks.$inferInsert;
export type SelectXmppRosterLink = typeof xmppRosterLinks.$inferSelect;

// ---------------------------------------------------------------------------
// xmpp_offline_queue — transient store-and-forward relay buffer (TTL'd)
// ---------------------------------------------------------------------------

export const xmppOfflineQueue = pgTable(
	"xmpp_offline_queue",
	{
		id: uuid().primaryKey().defaultRandom(),
		accountId: uuid("account_id")
			.notNull()
			.references(() => xmppAccounts.id, { onDelete: "cascade" }),

		direction: xmppDirection().notNull(),
		fromJid: text("from_jid").notNull(),
		toJid: text("to_jid").notNull(),
		stanzaKind: text("stanza_kind").notNull(), // message | presence | iq
		// Normalized stanza incl. body, thread, id — NOT the canonical chat store
		// (that's D1); this is a transient relay buffer only.
		stanza: jsonb().$type<XmppStanzaPayload>().notNull().default({}),
		// XEP-0359 stanza-id / dedupe key for idempotent enqueue.
		originId: text("origin_id"),

		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		// TTL (default +30d, set by the service layer) so the buffer self-prunes.
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Idempotent enqueue: one row per (account, origin_id) where present.
		uniqueIndex("xmpp_offline_queue_account_origin_uniq")
			.on(t.accountId, t.originId)
			.where(sql`${t.originId} IS NOT NULL`),
		// Drain: pull a user's undelivered stanzas.
		index("xmpp_offline_queue_account_delivered_idx").on(
			t.accountId,
			t.deliveredAt,
		),
		// TTL sweep.
		index("xmpp_offline_queue_expires_idx").on(t.expiresAt),
	],
);

export type InsertXmppOfflineQueue = typeof xmppOfflineQueue.$inferInsert;
export type SelectXmppOfflineQueue = typeof xmppOfflineQueue.$inferSelect;

// ---------------------------------------------------------------------------
// xmpp_federation_policy — per remote-domain allow/deny + rate
// ---------------------------------------------------------------------------

export const xmppFederationPolicy = pgTable(
	"xmpp_federation_policy",
	{
		id: uuid().primaryKey().defaultRandom(),
		// The remote server domain (`external-jabber.org`), normalized lowercase.
		domain: text().notNull(),
		policy: xmppFedPolicy().notNull().default("allow"),
		// Per-minute cap when `policy = throttle`. Null otherwise.
		ratePerMin: integer("rate_per_min"),
		reason: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One policy row per remote domain (global; federation is not org-scoped).
		uniqueIndex("xmpp_federation_policy_domain_uniq").on(t.domain),
	],
);

export type InsertXmppFederationPolicy =
	typeof xmppFederationPolicy.$inferInsert;
export type SelectXmppFederationPolicy =
	typeof xmppFederationPolicy.$inferSelect;

// ---------------------------------------------------------------------------
// xmpp_nonces — single-use replay guard for the bridge ingress (D4)
// ---------------------------------------------------------------------------

/**
 * Each signed bridge POST to `/api/xmpp/inbound` carries a one-time nonce inside
 * the timestamp-skew window. The per-process in-memory set does not hold across
 * horizontally-scaled API instances, so the DB is the source of truth: a nonce
 * is consumed by INSERT, and a unique-constraint violation on the primary key
 * means the nonce was already seen ⇒ replay. Mirrors `mail_nonces` (D3).
 *
 * Additive, infra-only — no FK, no org scoping (the nonce is global to the
 * webhook, not tenant data).
 */
export const xmppNonces = pgTable(
	"xmpp_nonces",
	{
		nonce: text().primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Prune sweep: delete rows past their expiry cheaply.
		index("xmpp_nonces_expires_idx").on(t.expiresAt),
	],
);

export type InsertXmppNonce = typeof xmppNonces.$inferInsert;
export type SelectXmppNonce = typeof xmppNonces.$inferSelect;
