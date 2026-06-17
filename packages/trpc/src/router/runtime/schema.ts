/**
 * Zod contracts for the infra-runtime router (#02, §2.1). Boundary validation
 * for storage / embedding / vector / runtime-health / sync procedures.
 *
 * Mirrors `knowledge/schema.ts`: reuse the core enums from `@rox/db/enums`,
 * keep money/sizes as integers, timestamps as ISO datetimes. Secrets never
 * appear in any input/output schema.
 */

import {
	aiProviderKindEnum,
	embeddingJobStatusEnum,
	entityKindEnum,
	runtimeServiceKindEnum,
	runtimeServiceStateEnum,
	storageBucketPrefixEnum,
	storageObjectStatusEnum,
} from "@rox/db/enums";
import { readEmbeddingDim } from "@rox/runtime-clients/runtime-config";
import { z } from "zod";

const orgScoped = z.object({ organizationId: z.string().uuid() });

/**
 * Vector dimension (B2). Boundary-fixes the `vector` length to prevent a
 * vector-DoS (huge payload) and collection mismatch (00-SC §3).
 */
export const EMBEDDING_DIM = readEmbeddingDim();

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const cursorSchema = z.object({
	createdAt: z.string().datetime(),
	entityId: z.string().uuid(),
});

const MAX_OBJECT_BYTES = 5_000_000_000; // 5 GB hard cap

// --- 1) storage.createUploadUrl
export const createUploadUrlInput = orgScoped.extend({
	idempotencyKey: z.string().uuid(),
	prefix: storageBucketPrefixEnum,
	fileName: z.string().min(1).max(255),
	mime: z.string().min(1).max(255),
	sizeBytes: z.number().int().positive().max(MAX_OBJECT_BYTES),
	v2ProjectId: z.string().uuid().optional(),
	checksumSha256: sha256Hex.optional(),
});
export const createUploadUrlOutput = z.object({
	entityId: z.string().uuid(),
	bucket: z.string(),
	objectKey: z.string(),
	uploadUrl: z.string().url().nullable(), // null on dedup (no upload needed)
	expiresInSec: z.number().int().positive(),
});

// --- 2) storage.confirmUpload
export const confirmUploadInput = orgScoped.extend({
	entityId: z.string().uuid(),
	checksumSha256: sha256Hex.optional(),
	sizeBytes: z.number().int().positive().max(MAX_OBJECT_BYTES).optional(),
	mime: z.string().min(1).max(255).optional(),
});

// --- 3) storage.getDownloadUrl
export const getDownloadUrlInput = orgScoped.extend({
	entityId: z.string().uuid(),
	expiresInSec: z.number().int().min(60).max(3600).default(900),
});
export const getDownloadUrlOutput = z.object({
	url: z.string().url(),
	expiresInSec: z.number().int(),
});

// --- 4) storage.delete
export const deleteInput = orgScoped.extend({
	entityId: z.string().uuid(),
	hard: z.boolean().default(false),
});
export const deleteOutput = z.object({
	entityId: z.string().uuid(),
	status: storageObjectStatusEnum,
});

// --- 5) storage.list
export const listInput = orgScoped.extend({
	prefix: storageBucketPrefixEnum.optional(),
	v2ProjectId: z.string().uuid().optional(),
	status: storageObjectStatusEnum.default("stored"),
	cursor: cursorSchema.optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

// --- 6) embedding.enqueue
export const enqueueInput = orgScoped.extend({
	entityId: z.string().uuid(),
	kind: entityKindEnum,
	provider: aiProviderKindEnum.default("local"),
	embeddingVersion: z.number().int().positive().optional(),
	contentHash: sha256Hex.optional(),
	payload: z.object({
		kind: entityKindEnum,
		userId: z.string().uuid().optional(),
		v2ProjectId: z.string().uuid().optional(),
		tags: z.array(z.string().max(128)).max(64).optional(),
		updatedAt: z.string().datetime().optional(),
	}),
});
export const enqueueOutput = z.object({
	jobId: z.string().uuid(),
	status: embeddingJobStatusEnum,
});

// --- 7) embedding.claimBatch (serviceProcedure)
export const claimBatchInput = orgScoped.extend({
	workerId: z.string().min(1).max(128),
	limit: z.number().int().min(1).max(100).default(25),
	leaseSec: z.number().int().min(30).max(600).default(120),
});
const embeddingJobClaim = z.object({
	jobId: z.string().uuid(),
	entityId: z.string().uuid(),
	kind: entityKindEnum,
	provider: aiProviderKindEnum,
	embeddingVersion: z.number().int().positive(),
	embedText: z.string(),
});
export const claimBatchOutput = z.object({ jobs: z.array(embeddingJobClaim) });

// --- 8) embedding.complete (serviceProcedure)
export const completeInput = orgScoped.extend({
	jobId: z.string().uuid(),
	outcome: z.enum(["done", "failed", "skipped"]),
	error: z.string().max(2000).optional(),
	vectorWritten: z.boolean().optional(),
});
export const completeOutput = z.object({
	jobId: z.string().uuid(),
	status: embeddingJobStatusEnum,
});

// --- 9) vector.search — exactly one of { vector, queryText }; vector length fixed.
export const vectorSearchInput = orgScoped
	.extend({
		vector: z.array(z.number().finite()).length(EMBEDDING_DIM).optional(),
		queryText: z.string().min(1).max(8192).optional(),
		kinds: z.array(entityKindEnum).max(32).optional(),
		v2ProjectId: z.string().uuid().optional(),
		tags: z.array(z.string().max(128)).max(64).optional(),
		limit: z.number().int().min(1).max(100).default(20),
		scoreThreshold: z.number().min(0).max(1).optional(),
	})
	.refine((v) => (v.vector === undefined) !== (v.queryText === undefined), {
		message: "exactly one of { vector, queryText } is required",
	});
export const vectorSearchOutput = z.object({
	hits: z.array(
		z.object({
			entityId: z.string().uuid(),
			kind: entityKindEnum,
			score: z.number(),
		}),
	),
	degraded: z.boolean(),
});

// --- 10) vector.reindex (admin)
export const reindexInput = orgScoped.extend({
	kinds: z.array(entityKindEnum).max(32).optional(),
	bumpVersion: z.boolean().default(true),
});
export const reindexOutput = z.object({
	enqueued: z.number().int(),
	embeddingVersion: z.number().int(),
});

// --- 11) runtime.health
export const healthInput = orgScoped;
const runtimeServiceCard = z.object({
	kind: runtimeServiceKindEnum,
	state: runtimeServiceStateEnum,
	endpoint: z.string().optional(),
	version: z.string().optional(),
	lastHealthAt: z.string().datetime().nullable().optional(),
	health: z.object({
		ok: z.boolean().optional(),
		latencyMs: z.number().optional(),
		detail: z.string().optional(),
	}),
	// NOTE: `secretKeys` is intentionally NOT part of the output (§2.1 #11).
});
export const healthOutput = z.object({
	services: z.array(runtimeServiceCard),
});

// --- 12) runtime.reportHealth (serviceProcedure)
function isLoopbackOrContainerEndpoint(value: string): boolean {
	try {
		const url = new URL(value);
		if (!["http:", "https:"].includes(url.protocol)) return false;
		const host = url.hostname.toLowerCase();
		if (host === "localhost" || host === "127.0.0.1") return true;
		if (host === "::1" || host === "[::1]") return true;
		if (host === "host.docker.internal") return true;
		return /^[a-z0-9][a-z0-9-]*$/i.test(host);
	} catch {
		return false;
	}
}

const loopbackEndpoint = z
	.string()
	.url()
	.refine(isLoopbackOrContainerEndpoint, {
		message: "endpoint must be loopback/container host",
	});
export const reportHealthInput = orgScoped
	.extend({
		kind: runtimeServiceKindEnum,
		state: runtimeServiceStateEnum,
		deviceId: z.string().min(1).max(128).optional(),
		endpoint: loopbackEndpoint.optional(),
		version: z.string().max(128).optional(),
		secretKeys: z.array(z.string().max(128)).max(32).optional(),
		health: z
			.object({
				ok: z.boolean().optional(),
				latencyMs: z.number().optional(),
				detail: z.string().max(1000).optional(),
			})
			.optional(),
	})
	.refine((v) => (["turso"].includes(v.kind) ? !!v.deviceId : true), {
		message: "per-device service kinds require deviceId",
	});
export const reportHealthOutput = z.object({ ok: z.literal(true) });

// --- 13) sync.electricToken
export const electricTokenInput = orgScoped.extend({
	shapes: z
		.array(z.enum(["entities", "edges", "identity_links", "activity_events"]))
		.optional(),
});
export const electricTokenOutput = z.object({
	token: z.string(),
	expiresInSec: z.number().int().max(300),
});

// --- 14) sync.saveCursor
export const saveCursorInput = orgScoped.extend({
	deviceId: z.string().min(1).max(128),
	shape: z.string().min(1).max(64),
	electricHandle: z.string().max(256).optional(),
	electricOffset: z.string().max(256).optional(),
	lastSyncedAt: z.string().datetime().optional(),
});
export const saveCursorOutput = z.object({ ok: z.literal(true) });
