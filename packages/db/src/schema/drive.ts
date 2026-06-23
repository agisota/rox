/**
 * Rox Workspace Suite — D8/D9 Drive (comms-suite epic, P0).
 *
 * Per-user object storage: a 10 GiB free quota shared across Drive + chat (D2)
 * + email (D3) attachments, folders, content-addressed files, public shares,
 * trash, and optional versioning. The D8 and D9 specs both proposed a
 * `drive.ts`; this is the single reconciled file using D8's richer table set
 * (canonical) with D9's R2-primary substrate decision folded into the
 * `storage_key` scheme + WS-E overage bridge.
 *
 *   storage_quota       → one row per user; the atomic accounting record
 *   drive_folders       → per-user folder tree (root = parent_id NULL)
 *   drive_files         → logical file = pointer to a content-addressed object
 *   drive_file_versions → optional history (schema reserved; versioning DQ in §7)
 *   drive_shares        → public access grants for a file OR folder (rox.one/d/<token>)
 *   drive_file_refs     → bridge: a Drive file referenced by chat/email/canvas
 *
 * Owner decisions (plans/rox-comms-suite/DECISIONS.md):
 *   DQ1 — Cloudflare R2 is the public primary; the object key is
 *         `u/<userId>/<sha256>` (content-addressed, per-user dedup).
 *   DQ2 — 10 GiB free PER USER, a SINGLE shared quota across Drive + chat +
 *         email attachments. SOFT-METER on exceed: overage debits the WS-E token
 *         economy (`rox_ledger` kind `drive_overage`); existing files stay
 *         readable; never hard-blocked at the cap. `storage_quota.quota_bytes`
 *         defaults to 10 GiB and `bytes_used` is maintained atomically.
 *
 * Ownership keys are `auth.users(id)` (UUID, stable across handle renames);
 * `user_profiles.handle` is resolved only at the presentation layer for public
 * share/profile branding (ROX-522).
 *
 * Additive only — NEVER hand-edit migrations; change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	check,
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
	driveFileStatusValues,
	driveRefSourceValues,
	driveSharePermValues,
} from "./enums";

// 10 GiB free quota per user (DQ2). 10 * 1024^3 = 10737418240 bytes.
export const DRIVE_FREE_QUOTA_BYTES = 10_737_418_240;

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const driveFileStatus = pgEnum(
	"drive_file_status",
	driveFileStatusValues,
);
export const driveSharePerm = pgEnum("drive_share_perm", driveSharePermValues);
export const driveRefSource = pgEnum("drive_ref_source", driveRefSourceValues);

/** Async scan verdict attached to a file once scanning completes. */
export type DriveScanResult = {
	engine?: string;
	verdict?: string;
	ts?: string;
};

// ---------------------------------------------------------------------------
// storage_quota — one row per user; the atomic accounting record (DQ2)
// ---------------------------------------------------------------------------

export const storageQuota = pgTable(
	"storage_quota",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// 10 GiB free (DQ2); seeded lazily on first Drive use, like rox_balances.
		quotaBytes: bigint("quota_bytes", { mode: "number" })
			.notNull()
			.default(DRIVE_FREE_QUOTA_BYTES),
		// Maintained atomically via conditional UPDATE on upload/delete.
		bytesUsed: bigint("bytes_used", { mode: "number" }).notNull().default(0),
		// DQ2 soft-meter: when true, uploads past the cap accrue WS-E overage
		// rather than being blocked. Default false = block new uploads at the cap
		// until the user opts in (existing files always stay readable).
		overageOptIn: boolean("overage_opt_in").notNull().default(false),

		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("storage_quota_user_uniq").on(t.userId),
		check("storage_quota_bytes_used_nonneg", sql`${t.bytesUsed} >= 0`),
	],
);

export type InsertStorageQuota = typeof storageQuota.$inferInsert;
export type SelectStorageQuota = typeof storageQuota.$inferSelect;

// ---------------------------------------------------------------------------
// drive_folders — per-user folder tree (root = parent_id NULL)
// ---------------------------------------------------------------------------

export const driveFolders = pgTable(
	"drive_folders",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		parentId: uuid("parent_id").references((): AnyPgColumn => driveFolders.id, {
			onDelete: "cascade",
		}),

		name: text().notNull(),
		// System folders (Email/, Chat/, Trash anchor) are not user-deletable.
		isSystem: boolean("is_system").notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("drive_folders_user_parent_idx").on(t.userId, t.parentId),
		// No duplicate sibling names within one directory for a user.
		uniqueIndex("drive_folders_sibling_name_uniq").on(
			t.userId,
			t.parentId,
			t.name,
		),
	],
);

export type InsertDriveFolder = typeof driveFolders.$inferInsert;
export type SelectDriveFolder = typeof driveFolders.$inferSelect;

// ---------------------------------------------------------------------------
// drive_files — logical file = pointer to a content-addressed object
// ---------------------------------------------------------------------------

export const driveFiles = pgTable(
	"drive_files",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// NULL = root. set-null so deleting a folder detaches its files to root
		// rather than destroying them.
		folderId: uuid("folder_id").references(() => driveFolders.id, {
			onDelete: "set null",
		}),

		name: text().notNull(), // display filename (decoupled from the key)
		mediaType: text("media_type").notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		sha256: text().notNull(), // content hash (dedup + integrity)
		storageKey: text("storage_key").notNull(), // u/<userId>/<sha256> (DQ1)

		status: driveFileStatus().notNull().default("pending"),
		scanResult: jsonb("scan_result").$type<DriveScanResult>(),
		// Soft delete; hard-deleted after the retention window reclaims quota.
		trashedAt: timestamp("trashed_at", { withTimezone: true }),
		version: integer().notNull().default(1),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("drive_files_user_folder_idx").on(t.userId, t.folderId),
		index("drive_files_user_sha_idx").on(t.userId, t.sha256), // dedup lookup
		index("drive_files_status_idx").on(t.status),
		index("drive_files_trashed_idx").on(t.trashedAt), // trash sweep
		// One logical row per (user, content, version).
		uniqueIndex("drive_files_user_sha_version_uniq").on(
			t.userId,
			t.sha256,
			t.version,
		),
		check("drive_files_size_nonneg", sql`${t.sizeBytes} >= 0`),
	],
);

export type InsertDriveFile = typeof driveFiles.$inferInsert;
export type SelectDriveFile = typeof driveFiles.$inferSelect;

// ---------------------------------------------------------------------------
// drive_file_versions — optional history (schema reserved; versioning is a §7 DQ)
// ---------------------------------------------------------------------------

export const driveFileVersions = pgTable(
	"drive_file_versions",
	{
		id: uuid().primaryKey().defaultRandom(),
		fileId: uuid("file_id")
			.notNull()
			.references(() => driveFiles.id, { onDelete: "cascade" }),

		version: integer().notNull(),
		sha256: text().notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		storageKey: text("storage_key").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("drive_file_versions_file_version_uniq").on(
			t.fileId,
			t.version,
		),
	],
);

export type InsertDriveFileVersion = typeof driveFileVersions.$inferInsert;
export type SelectDriveFileVersion = typeof driveFileVersions.$inferSelect;

// ---------------------------------------------------------------------------
// drive_shares — public access grants for a file OR folder (rox.one/d/<token>)
// ---------------------------------------------------------------------------

export const driveShares = pgTable(
	"drive_shares",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }), // owner

		fileId: uuid("file_id").references(() => driveFiles.id, {
			onDelete: "cascade",
		}),
		folderId: uuid("folder_id").references(() => driveFolders.id, {
			onDelete: "cascade",
		}),

		token: text().notNull(), // url-safe random (>=128-bit); rox.one/d/<token>
		passwordHash: text("password_hash"), // argon2/bcrypt; NULL = no password
		expiresAt: timestamp("expires_at", { withTimezone: true }), // NULL = never
		permission: driveSharePerm().notNull().default("view"),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		takedown: boolean().notNull().default(false), // admin abuse flag
		viewCount: integer("view_count").notNull().default(0),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("drive_shares_token_uniq").on(t.token),
		index("drive_shares_user_idx").on(t.userId),
		index("drive_shares_file_idx").on(t.fileId),
		index("drive_shares_folder_idx").on(t.folderId),
		// Exactly one target: a file XOR a folder.
		check(
			"drive_shares_one_target",
			sql`(${t.fileId} IS NOT NULL) <> (${t.folderId} IS NOT NULL)`,
		),
	],
);

export type InsertDriveShare = typeof driveShares.$inferInsert;
export type SelectDriveShare = typeof driveShares.$inferSelect;

// ---------------------------------------------------------------------------
// drive_file_refs — bridge: a Drive file referenced by chat/email/canvas (D2/D3)
// ---------------------------------------------------------------------------

export const driveFileRefs = pgTable(
	"drive_file_refs",
	{
		id: uuid().primaryKey().defaultRandom(),
		fileId: uuid("file_id")
			.notNull()
			.references(() => driveFiles.id, { onDelete: "cascade" }),

		sourceKind: driveRefSource("source_kind").notNull(),
		// e.g. chat message id, email message id. Loose ref (no FK) so the bridge
		// works across domains without a hard schema coupling.
		sourceId: uuid("source_id").notNull(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("drive_file_refs_file_idx").on(t.fileId),
		uniqueIndex("drive_file_refs_source_uniq").on(
			t.sourceKind,
			t.sourceId,
			t.fileId,
		),
	],
);

export type InsertDriveFileRef = typeof driveFileRefs.$inferInsert;
export type SelectDriveFileRef = typeof driveFileRefs.$inferSelect;
