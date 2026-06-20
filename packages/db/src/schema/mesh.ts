/**
 * Rox Workspace Suite — D5 Mesh / Decentralized Transport (comms-suite epic).
 *
 * Bridges the D1 comms hub to a decentralized fallback transport so a rox user's
 * DMs still flow when the rox backbone is unreachable. The shippable half (this
 * PR) is the **Nostr internet fallback**: the rox identity (`user_profiles.handle`,
 * ROX-522) maps to a per-device Nostr/Noise keypair, and inbound relay events are
 * bridged into the D1 unified inbox (transport = `mesh`). BLE local mesh is
 * client-side and DEFERRED (see plans/rox-comms-suite/D5-mesh-spec.md §3).
 *
 * The `mesh_*` tables below are the ONLY Drizzle-owned additions and describe the
 * SERVER-SIDE Rox↔mesh mapping:
 *
 *   mesh_devices     → one row per (user, device): the PUBLIC mesh identity
 *                      (Nostr npub + Noise/Ed25519 pubkeys) bound to a rox user,
 *                      with DQ4 reserve/grace semantics on rotation/rename.
 *   mesh_relays      → org-curated Nostr relay subscription config (defaults
 *                      seeded for the global/null-org set).
 *   mesh_nonces      → single-use replay guard for the bridge ingress (mirrors
 *                      xmpp_nonces / mail_nonces).
 *   mesh_delivery_log→ audit + idempotent dedup ledger of fallback-delivered
 *                      events (the relay-redelivery dedup contract).
 *
 * CRITICAL: private keys NEVER reach the server. Only PUBLIC keys live here; the
 * secret material lives in expo-secure-store (mobile) / Electron safeStorage
 * (desktop) on the client. There is no column for a private key anywhere.
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ3 — identity is GLOBAL per user; the mesh identity belongs to the person,
 *         not an org. `organization_id` is still stamped (Electric shape
 *         convention) using the user's personal/active org, never siloing it.
 *   DQ4 — a rotated/renamed device key's old pubkey is reserved PERMANENTLY
 *         (never reassigned) and aliases to the new owner for 90 days
 *         (`mesh_devices.reserved_until`) then retires. Applies to mesh identity
 *         keys exactly like the D1/D3/D4 handle reservation.
 *
 * Multi-tenant: every owned table carries `organization_id` and indexes are
 * org/owner-leading. Multiplatform: rows live-sync to web/desktop/mobile via
 * ElectricSQL.
 *
 * Bodies of bridged conversations are NOT primarily stored here — that content is
 * owned by the D1 hub (`comms_messages`, transport = `mesh`). `mesh_delivery_log`
 * is a transport-fact ledger only and references the D1 message id loosely (no
 * FK — D1 owns the message lifecycle), mirroring how D4 loose-couples to D1.
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
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	meshDeliveryStatusValues,
	meshDeviceStatusValues,
	meshDirectionValues,
} from "./enums";

/** The canonical Nostr relay used as the guaranteed-default fallback endpoint. */
export const ROX_DEFAULT_MESH_RELAY = "wss://relay.rox.one";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const meshDeviceStatus = pgEnum(
	"mesh_device_status",
	meshDeviceStatusValues,
);
export const meshDirection = pgEnum("mesh_direction", meshDirectionValues);
export const meshDeliveryStatus = pgEnum(
	"mesh_delivery_status",
	meshDeliveryStatusValues,
);

// ---------------------------------------------------------------------------
// shared jsonb shapes
// ---------------------------------------------------------------------------

/** A normalized mesh/Nostr event buffered for the dedup ledger (ids + meta). */
export type MeshEventPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// mesh_devices — one row per (user, device): the PUBLIC mesh identity
// ---------------------------------------------------------------------------

export const meshDevices = pgTable(
	"mesh_devices",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Human label for the device ("Mark's iPhone"). Optional.
		deviceLabel: text("device_label"),

		// The PUBLIC Nostr pubkey (bech32 npub OR 32-byte hex), normalized. This is
		// the routing identity peers resolve back to a rox user. GLOBALLY unique:
		// one owner per pubkey across all orgs (DQ4 permanent reservation enforced
		// at the service layer; this guards live duplicates).
		nostrPubkey: text("nostr_pubkey").notNull(),
		// X25519 static public key (base64), Noise XX — for the DEFERRED BLE mesh
		// adapter. Nullable: a Nostr-only device may not have provisioned one.
		noiseStaticPub: text("noise_static_pub"),
		// Ed25519 signing public key (base64) for packet/event signature verify.
		ed25519Pub: text("ed25519_pub"),

		status: meshDeviceStatus().notNull().default("active"),
		// DQ4 90-day grace window: when a device key is ROTATED, a `reserved`-status
		// row keeps the old pubkey routing to the current owner until this instant,
		// then retires. NULL = an active device (no pending retirement) OR a
		// permanent reservation with no active routing (status=reserved).
		reservedUntil: timestamp("reserved_until", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Global pubkey uniqueness: one owner per Nostr pubkey across all orgs.
		uniqueIndex("mesh_devices_pubkey_uniq").on(t.nostrPubkey),
		index("mesh_devices_user_idx").on(t.userId),
		index("mesh_devices_org_idx").on(t.organizationId),
		// Lookup an active device by pubkey on the inbound resolve path.
		index("mesh_devices_pubkey_status_idx").on(t.nostrPubkey, t.status),
	],
);

export type InsertMeshDevice = typeof meshDevices.$inferInsert;
export type SelectMeshDevice = typeof meshDevices.$inferSelect;

// ---------------------------------------------------------------------------
// mesh_relays — org-curated Nostr relay subscription config
// ---------------------------------------------------------------------------

export const meshRelays = pgTable(
	"mesh_relays",
	{
		id: uuid().primaryKey().defaultRandom(),
		// null-org row = the global default relay set every org inherits. A non-null
		// org row is that org's curated override/addition.
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),

		// The relay websocket URL (`wss://relay...`), normalized lowercase.
		url: text().notNull(),
		enabled: jsonb()
			.$type<{ enabled: boolean }>()
			.notNull()
			.default({ enabled: true }),
		// Lower = tried first when fanning out a fallback send.
		priority: smallint().notNull().default(100),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One row per (org, url). The null-org global set dedups on url alone via
		// the partial index below; this guards the per-org rows.
		uniqueIndex("mesh_relays_org_url_uniq")
			.on(t.organizationId, t.url)
			.where(sql`${t.organizationId} IS NOT NULL`),
		// The global (null-org) default set dedups on url alone.
		uniqueIndex("mesh_relays_global_url_uniq")
			.on(t.url)
			.where(sql`${t.organizationId} IS NULL`),
		index("mesh_relays_org_idx").on(t.organizationId),
	],
);

export type InsertMeshRelay = typeof meshRelays.$inferInsert;
export type SelectMeshRelay = typeof meshRelays.$inferSelect;

// ---------------------------------------------------------------------------
// mesh_delivery_log — audit + idempotent dedup ledger of delivered events
// ---------------------------------------------------------------------------

export const meshDeliveryLog = pgTable(
	"mesh_delivery_log",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// D1 canonical message id (loose ref, no FK: D1 owns the message lifecycle).
		messageId: uuid("message_id"),
		// Stable dedup key: the Nostr event id when present, else a deterministic
		// hash of stable event fields. The dedup guarantee against relay
		// redelivery (a relay may resend the same event).
		idempotencyKey: text("idempotency_key").notNull(),

		direction: meshDirection().notNull(),
		status: meshDeliveryStatus().notNull().default("delivered"),
		// BLE telemetry: observed relay hop count (DEFERRED; null for Nostr).
		hops: integer(),
		// Transport-fact metadata (event id, relay url, sender pubkey, etc.).
		meta: jsonb().$type<MeshEventPayload>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
	},
	(t) => [
		// The dedup contract: one ledger row per (org, idempotency_key, direction).
		// A redelivered relay event collapses onto the same row.
		uniqueIndex("mesh_delivery_log_org_key_dir_uniq").on(
			t.organizationId,
			t.idempotencyKey,
			t.direction,
		),
		index("mesh_delivery_log_message_idx").on(t.messageId),
		index("mesh_delivery_log_status_idx").on(t.status),
	],
);

export type InsertMeshDeliveryLog = typeof meshDeliveryLog.$inferInsert;
export type SelectMeshDeliveryLog = typeof meshDeliveryLog.$inferSelect;

// ---------------------------------------------------------------------------
// mesh_nonces — single-use replay guard for the bridge ingress (D5)
// ---------------------------------------------------------------------------

/**
 * Each signed relay-watcher POST to `/api/mesh/inbound` carries a one-time nonce
 * inside the timestamp-skew window. The DB is the source of truth: a nonce is
 * consumed by INSERT, and a unique-constraint violation on the primary key means
 * the nonce was already seen ⇒ replay. Mirrors `xmpp_nonces` (D4).
 *
 * Additive, infra-only — no FK, no org scoping (the nonce is global to the
 * webhook, not tenant data).
 */
export const meshNonces = pgTable(
	"mesh_nonces",
	{
		nonce: text().primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Prune sweep: delete rows past their expiry cheaply.
		index("mesh_nonces_expires_idx").on(t.expiresAt),
	],
);

export type InsertMeshNonce = typeof meshNonces.$inferInsert;
export type SelectMeshNonce = typeof meshNonces.$inferSelect;
