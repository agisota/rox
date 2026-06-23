/**
 * Infra-runtime control-plane (#02, phase 0) — detail tables for the runtime
 * foundation (minio/qdrant/embedder/Turso/Electric sync).
 *
 * #02 does NOT own domain graph nodes. It adds control-plane detail tables:
 *   - `storage_objects` — 1:1 over an `entities(kind="file")` node (minio
 *     object metadata). PK == FK to `entities.id`, like `notes`/`agent_sessions`.
 *   - `embedding_jobs` — entities→qdrant indexing queue (B5).
 *   - `runtime_services` — registry of provisioned sidecars + health.
 *   - `sync_cursors` — Electric down-sync cursors per device.
 *
 * Mirrors `knowledge.ts`/`economy.ts` conventions: org cascade FK + org index,
 * `v2_project_id` set-null FK, jsonb bodies, lifecycle `status` enum instead of
 * `deleted_at`, timestamptz `created_at`/`updated_at` with `$onUpdate`, sizes as
 * bigint, `$inferInsert`/`$inferSelect` exports. NEVER hand-edit migrations —
 * change this file then run `bunx drizzle-kit generate --name="..."`
 * (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	foreignKey,
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
// #01 core graph node (`entities`, kind="file") — declared in entity.ts.
import { entities } from "./entity";
import {
	aiProviderKindValues,
	embeddingJobStatusValues,
	runtimeServiceKindValues,
	runtimeServiceStateValues,
	storageBucketPrefixValues,
	storageObjectStatusValues,
} from "./enums";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const storageBucketPrefix = pgEnum(
	"storage_bucket_prefix",
	storageBucketPrefixValues,
);
export const storageObjectStatus = pgEnum(
	"storage_object_status",
	storageObjectStatusValues,
);
export const embeddingJobStatus = pgEnum(
	"embedding_job_status",
	embeddingJobStatusValues,
);
export const aiProviderKind = pgEnum("ai_provider_kind", aiProviderKindValues);
export const runtimeServiceKind = pgEnum(
	"runtime_service_kind",
	runtimeServiceKindValues,
);
export const runtimeServiceState = pgEnum(
	"runtime_service_state",
	runtimeServiceStateValues,
);

// ---------------------------------------------------------------------------
// storage_objects — 1:1 over entity(kind="file")
// ---------------------------------------------------------------------------

export const storageObjects = pgTable(
	"storage_objects",
	{
		// PK == FK to the graph node (1:1). Cascade when the node is deleted.
		entityId: uuid("entity_id").primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),

		bucket: text().notNull(), // = `org-<orgId>` (A8); cached for queries
		prefix: storageBucketPrefix().notNull(), // files/frames/recordings/artifacts/exports/sessions
		objectKey: text("object_key").notNull(), // full key, e.g. files/<uuid>/name.png
		mime: text(),
		sizeBytes: bigint("size_bytes", { mode: "number" }),
		checksumSha256: text("checksum_sha256"), // dedup/reconciliation (hex)

		// Idempotency for POST `storage.createUploadUrl` — self-contained for #02:
		// a retry with the same key in an org resolves via partial-uniq
		// (organizationId, idempotency_key).
		idempotencyKey: uuid("idempotency_key"),

		status: storageObjectStatus().notNull().default("pending"),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
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
		index("storage_objects_org_idx").on(t.organizationId),
		index("storage_objects_prefix_idx").on(t.prefix),
		index("storage_objects_status_idx").on(t.status),
		uniqueIndex("storage_objects_bucket_key_uniq").on(t.bucket, t.objectKey),
		foreignKey({
			columns: [t.entityId, t.organizationId],
			foreignColumns: [entities.id, entities.organizationId],
			name: "storage_objects_entity_org_fk",
		}).onDelete("cascade"),
		// Content dedup within org+prefix (partial — only when checksum is known).
		uniqueIndex("storage_objects_org_prefix_checksum_uniq")
			.on(t.organizationId, t.prefix, t.checksumSha256)
			.where(sql`${t.checksumSha256} IS NOT NULL`),
		// Idempotency for createUploadUrl: one object per (org, idempotency_key).
		uniqueIndex("storage_objects_org_idempotency_uniq")
			.on(t.organizationId, t.idempotencyKey)
			.where(sql`${t.idempotencyKey} IS NOT NULL`),
	],
);

export type InsertStorageObject = typeof storageObjects.$inferInsert;
export type SelectStorageObject = typeof storageObjects.$inferSelect;

// ---------------------------------------------------------------------------
// embedding_jobs — entities→qdrant indexing queue (B5)
// ---------------------------------------------------------------------------

export const embeddingJobs = pgTable(
	"embedding_jobs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Indexed graph node (any searchable kind: note/email/agent_session/...).
		entityId: uuid("entity_id").notNull(),
		kind: text().notNull(), // entityKind of the node (denorm for worker filter)
		status: embeddingJobStatus().notNull().default("queued"),
		provider: aiProviderKind().notNull().default("local"),
		// Embedding model/config version — for bulk reindex when the model changes.
		embeddingVersion: integer("embedding_version").notNull().default(1),
		// sha256 of the embed-text at enqueue time — skip when content unchanged.
		contentHash: text("content_hash"),
		attempts: integer().notNull().default(0),
		lastError: text("last_error"),
		// Payload the worker upserts into qdrant (see §1.6). The enqueuer MUST
		// provide it (a meaningful non-empty `kind` is needed for the `kind[]`
		// filter). No default on purpose: an empty `{ kind: "" }` would silently
		// land in the qdrant payload and break filtering.
		payload: jsonb()
			.$type<{
				kind: string;
				userId?: string;
				v2ProjectId?: string;
				tags?: string[];
				updatedAt?: string;
			}>()
			.notNull(),
		scheduledAt: timestamp("scheduled_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("embedding_jobs_org_idx").on(t.organizationId),
		index("embedding_jobs_status_sched_idx").on(t.status, t.scheduledAt),
		index("embedding_jobs_entity_idx").on(t.entityId),
		foreignKey({
			columns: [t.entityId, t.organizationId],
			foreignColumns: [entities.id, entities.organizationId],
			name: "embedding_jobs_entity_org_fk",
		}).onDelete("cascade"),
		// One ACTIVE job per (entity, version): enqueue dedup (partial uniq).
		uniqueIndex("embedding_jobs_entity_version_active_uniq")
			.on(t.entityId, t.embeddingVersion)
			.where(sql`${t.status} IN ('queued','running')`),
	],
);

export type InsertEmbeddingJob = typeof embeddingJobs.$inferInsert;
export type SelectEmbeddingJob = typeof embeddingJobs.$inferSelect;

// ---------------------------------------------------------------------------
// runtime_services — sidecar registry + health
// ---------------------------------------------------------------------------

export const runtimeServices = pgTable(
	"runtime_services",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		kind: runtimeServiceKind().notNull(),
		state: runtimeServiceState().notNull().default("provisioning"),
		// For per-device services (turso) — device id; for org-scoped
		// (minio/qdrant/embedder) NULL. Splits the natural key cleanly.
		deviceId: text("device_id"),
		// Where to reach it (local port / container endpoint). Secrets NOT here.
		endpoint: text(), // e.g. http://127.0.0.1:9000 (minio)
		version: text(), // image/binary version
		// secret-store key names the service needs (values resolved on device).
		secretKeys: jsonb("secret_keys").$type<string[]>().notNull().default([]),
		lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
		health: jsonb()
			.$type<{ ok?: boolean; latencyMs?: number; detail?: string }>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("runtime_services_org_idx").on(t.organizationId),
		// Org-scoped services (minio/qdrant/embedder): one logical instance per
		// (org, kind), only when deviceId IS NULL — partial uniq so per-device
		// rows do not conflict.
		uniqueIndex("runtime_services_org_kind_uniq")
			.on(t.organizationId, t.kind)
			.where(sql`${t.deviceId} IS NULL`),
		// Per-device services (turso, phase 6): unique by (org, kind, deviceId).
		uniqueIndex("runtime_services_org_kind_device_uniq")
			.on(t.organizationId, t.kind, t.deviceId)
			.where(sql`${t.deviceId} IS NOT NULL`),
	],
);

export type InsertRuntimeService = typeof runtimeServices.$inferInsert;
export type SelectRuntimeService = typeof runtimeServices.$inferSelect;

// ---------------------------------------------------------------------------
// sync_cursors — Electric down-sync cursors per device
// ---------------------------------------------------------------------------

export const syncCursors = pgTable(
	"sync_cursors",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		deviceId: text("device_id").notNull(), // stable device id (desktop/web)
		shape: text().notNull(), // shape/table name ("entities","edges",...)
		// Electric shape progress: handle + offset (for resumable down-sync).
		electricHandle: text("electric_handle"),
		electricOffset: text("electric_offset"),
		lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("sync_cursors_org_idx").on(t.organizationId),
		uniqueIndex("sync_cursors_org_device_shape_uniq").on(
			t.organizationId,
			t.deviceId,
			t.shape,
		),
	],
);

export type InsertSyncCursor = typeof syncCursors.$inferInsert;
export type SelectSyncCursor = typeof syncCursors.$inferSelect;

// ---------------------------------------------------------------------------
// agent_state_claims — strict single-writer claim leases (CAS-arbitrated)
// ---------------------------------------------------------------------------

/**
 * Postgres-arbitrated lease registry for strict single-writer claims
 * (`@rox/agent-state`'s claim path, WS-D). libSQL embedded replicas are
 * last-writer-wins and so CANNOT arbitrate mutual exclusion — the few
 * operations that need real serialization ("only host A may run preinstall X",
 * "claim workspace W") are resolved here via an atomic compare-and-swap (CAS)
 * lease, never by libSQL LWW.
 *
 * The claim is keyed by `(organization_id, scope, scope_id, key)` and carries a
 * holder (`owner_device`) plus a `lease_expires_at` deadline. A claim is granted
 * when the row is unowned, when the existing lease has expired, or when the same
 * device re-claims (idempotent renewal) — enforced atomically by a single
 * conditional `INSERT ... ON CONFLICT DO UPDATE ... WHERE` in
 * `runtime.claim` (see `packages/trpc/src/router/runtime/runtime.ts`). A live
 * lease held by a different device is rejected.
 */
export const agentStateClaims = pgTable(
	"agent_state_claims",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Coordination scope the claim is keyed under: workspace | run | host.
		scope: text().notNull(),
		scopeId: text("scope_id").notNull(),
		// Claim discriminator within the scope (e.g. "preinstall", "owner").
		key: text().notNull(),
		// Device currently holding the lease.
		ownerDevice: text("owner_device").notNull(),
		// Lease deadline: at/after this instant the claim is reclaimable by anyone.
		leaseExpiresAt: timestamp("lease_expires_at", {
			withTimezone: true,
		}).notNull(),
		// When the current holder acquired/last renewed the lease.
		claimedAt: timestamp("claimed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("agent_state_claims_org_idx").on(t.organizationId),
		index("agent_state_claims_lease_idx").on(t.leaseExpiresAt),
		// The natural key: one lease row per (org, scope, scope_id, key). The CAS
		// upsert conflict-targets this index.
		uniqueIndex("agent_state_claims_org_scope_key_uniq").on(
			t.organizationId,
			t.scope,
			t.scopeId,
			t.key,
		),
	],
);

export type InsertAgentStateClaim = typeof agentStateClaims.$inferInsert;
export type SelectAgentStateClaim = typeof agentStateClaims.$inferSelect;
