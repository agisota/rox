/**
 * Infra-runtime router (#02, §2). Control-plane for the runtime foundation:
 * object storage (minio), the embedding queue (entities→qdrant), the vector
 * primitive (qdrant), the sidecar health registry, and Electric down-sync.
 *
 * Conventions mirror `knowledge.ts`/`graph.ts`: `protectedProcedure` +
 * `requireActiveOrgMembership` for user calls; `serviceProcedure` for trusted
 * worker/supervisor mutations; writes use `dbWs(.transaction)`, reads use `db`;
 * the graph node `file` is ONLY written via `graphService.create` (00-SC §2.6),
 * never a direct INSERT into `entities`. Secrets stay in env/secret-store and
 * never appear in input/output/logs.
 */

import { mintUserJwt } from "@rox/auth/server";
import { db, dbWs } from "@rox/db/client";
import {
	agentStateClaims,
	type EntityKind,
	embeddingJobs,
	entities,
	type InsertEmbeddingJob,
	runtimeServices,
	type SelectStorageObject,
	storageObjects,
	syncCursors,
} from "@rox/db/schema";
import {
	EMBEDDING_VERSION,
	embedTextForEntity,
	getEmbedder,
	getObjectStore,
	getVectorStore,
	objectKey,
	orgBucket,
	QDRANT_COLLECTION,
	runtimeClientConfig,
} from "@rox/runtime-clients";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, lt, lte, or, sql } from "drizzle-orm";
import { graphService } from "../../lib/graph";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	claimBatchInput,
	claimBatchOutput,
	claimInput,
	claimOutput,
	completeInput,
	completeOutput,
	confirmUploadInput,
	createUploadUrlInput,
	createUploadUrlOutput,
	deleteInput,
	deleteOutput,
	electricTokenInput,
	electricTokenOutput,
	enqueueInput,
	enqueueOutput,
	getDownloadUrlInput,
	getDownloadUrlOutput,
	healthInput,
	healthOutput,
	listInput,
	reindexInput,
	reindexOutput,
	reportHealthInput,
	reportHealthOutput,
	saveCursorInput,
	saveCursorOutput,
	vectorSearchInput,
	vectorSearchOutput,
} from "./schema";
import { serviceProcedure } from "./service-procedure";

const MAX_EMBED_ATTEMPTS = 5;
const REINDEX_BATCH_SIZE = 500;
const NON_INDEXABLE_KINDS = new Set<string>(["tag", "activity_event"]);

/** Per-prefix mime allowlist (anti-executable upload, OWASP). */
function mimeAllowedForPrefix(prefix: string, mime: string): boolean {
	const m = mime.toLowerCase();
	if (/application\/x-.*(executable|elf|mach|dosexec)/.test(m)) return false;
	if (m === "application/x-msdownload" || m === "application/x-elf") {
		return false;
	}
	switch (prefix) {
		case "frames":
			return m.startsWith("image/");
		case "recordings":
			return m.startsWith("audio/") || m.startsWith("video/");
		case "artifacts":
			return m.startsWith("text/") || m === "application/json";
		default:
			return true;
	}
}

/** Per-prefix size cap in bytes. */
function sizeLimitForPrefix(prefix: string): number {
	switch (prefix) {
		case "frames":
			return 50_000_000; // 50 MB
		case "recordings":
			return 2_000_000_000; // 2 GB
		default:
			return 5_000_000_000; // 5 GB
	}
}

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

async function getStorageObjectForOrg(
	organizationId: string,
	entityId: string,
): Promise<SelectStorageObject> {
	const [row] = await db
		.select()
		.from(storageObjects)
		.where(
			and(
				eq(storageObjects.organizationId, organizationId),
				eq(storageObjects.entityId, entityId),
			),
		)
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "object not found" });
	}
	return row;
}

async function requireStorageObjectOwnerOrAdmin(
	userId: string,
	organizationId: string,
	obj: SelectStorageObject,
): Promise<void> {
	if (obj.createdByUserId === userId) return;
	await verifyOrgAdmin(userId, organizationId);
}

async function requireServiceHealthy(
	organizationId: string,
	kind: "minio" | "qdrant",
): Promise<void> {
	const [svc] = await db
		.select({ state: runtimeServices.state })
		.from(runtimeServices)
		.where(
			and(
				eq(runtimeServices.organizationId, organizationId),
				eq(runtimeServices.kind, kind),
			),
		)
		.limit(1);
	if (!svc || svc.state !== "healthy") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `${kind} is not healthy`,
		});
	}
}

export const runtimeRouter = {
	// -------------------------------------------------------------------------
	// storage.*
	// -------------------------------------------------------------------------
	storage: {
		createUploadUrl: protectedProcedure
			.input(createUploadUrlInput)
			.output(createUploadUrlOutput)
			.mutation(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				if (input.organizationId !== organizationId) {
					throw new TRPCError({ code: "FORBIDDEN", message: "org mismatch" });
				}
				if (!mimeAllowedForPrefix(input.prefix, input.mime)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "mime not allowed",
					});
				}
				if (input.sizeBytes > sizeLimitForPrefix(input.prefix)) {
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: "too large",
					});
				}
				await requireServiceHealthy(organizationId, "minio");

				const bucket = orgBucket(organizationId);
				const store = getObjectStore();
				const ttlSec = 900;

				return dbWs.transaction(async (tx) => {
					// Idempotency: lock on (org, idempotencyKey); reissue if present.
					const [existing] = await tx
						.select()
						.from(storageObjects)
						.where(
							and(
								eq(storageObjects.organizationId, organizationId),
								eq(storageObjects.idempotencyKey, input.idempotencyKey),
							),
						)
						.for("update")
						.limit(1);
					if (existing) {
						const uploadUrl =
							existing.status === "pending"
								? await store.presignPut(
										existing.bucket,
										existing.objectKey,
										ttlSec,
										existing.mime ?? input.mime,
									)
								: null;
						return {
							entityId: existing.entityId,
							bucket: existing.bucket,
							objectKey: existing.objectKey,
							uploadUrl,
							expiresInSec: ttlSec,
						};
					}

					// Content dedup: existing stored object with same checksum.
					if (input.checksumSha256) {
						const [dupe] = await tx
							.select()
							.from(storageObjects)
							.where(
								and(
									eq(storageObjects.organizationId, organizationId),
									eq(storageObjects.prefix, input.prefix),
									eq(storageObjects.checksumSha256, input.checksumSha256),
									eq(storageObjects.status, "stored"),
								),
							)
							.limit(1);
						if (dupe) {
							return {
								entityId: dupe.entityId,
								bucket: dupe.bucket,
								objectKey: dupe.objectKey,
								uploadUrl: null,
								expiresInSec: ttlSec,
							};
						}
					}

					// Create the file node via the graph service (only writer).
					const entity = await graphService.create(tx, {
						orgId: organizationId,
						kind: "file",
						title: input.fileName,
						v2ProjectId: input.v2ProjectId ?? null,
						createdByUserId: ctx.session.user.id,
						idempotencyKey: input.idempotencyKey,
					});

					const key = objectKey(
						input.prefix,
						entity.id,
						sanitizeFileName(input.fileName),
					);
					const uploadUrl = await store.presignPut(
						bucket,
						key,
						ttlSec,
						input.mime,
					);

					await tx
						.update(entities)
						.set({
							storageRef: {
								bucket,
								key,
								mime: input.mime,
								size: input.sizeBytes,
							},
						})
						.where(eq(entities.id, entity.id));

					await tx.insert(storageObjects).values({
						entityId: entity.id,
						organizationId,
						v2ProjectId: input.v2ProjectId ?? null,
						bucket,
						prefix: input.prefix,
						objectKey: key,
						mime: input.mime,
						sizeBytes: input.sizeBytes,
						checksumSha256: input.checksumSha256 ?? null,
						idempotencyKey: input.idempotencyKey,
						status: "pending",
						createdByUserId: ctx.session.user.id,
					});

					return {
						entityId: entity.id,
						bucket,
						objectKey: key,
						uploadUrl,
						expiresInSec: ttlSec,
					};
				});
			}),

		confirmUpload: protectedProcedure
			.input(confirmUploadInput)
			.mutation(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				const obj = await getStorageObjectForOrg(
					organizationId,
					input.entityId,
				);
				if (obj.status === "stored") return obj; // idempotent no-op
				if (obj.status !== "pending") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "object is not pending upload confirmation",
					});
				}
				await requireStorageObjectOwnerOrAdmin(
					ctx.session.user.id,
					organizationId,
					obj,
				);

				const store = getObjectStore();
				const head = await store.head(obj.bucket, obj.objectKey);
				if (!head) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "object not uploaded",
					});
				}
				const mime = input.mime ?? head.mime ?? obj.mime ?? null;
				const sizeBytes = input.sizeBytes ?? head.size ?? obj.sizeBytes ?? null;
				const checksumSha256 =
					input.checksumSha256 ?? obj.checksumSha256 ?? null;

				return dbWs.transaction(async (tx) => {
					const [updated] = await tx
						.update(storageObjects)
						.set({ status: "stored", mime, sizeBytes, checksumSha256 })
						.where(
							and(
								eq(storageObjects.organizationId, organizationId),
								eq(storageObjects.entityId, input.entityId),
								eq(storageObjects.status, "pending"),
							),
						)
						.returning();
					if (!updated) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "object changed",
						});
					}
					await tx
						.update(entities)
						.set({
							storageRef: {
								bucket: obj.bucket,
								key: obj.objectKey,
								mime: mime ?? undefined,
								size: sizeBytes ?? undefined,
							},
						})
						.where(
							and(
								eq(entities.organizationId, organizationId),
								eq(entities.id, input.entityId),
							),
						);
					return updated;
				});
			}),

		getDownloadUrl: protectedProcedure
			.input(getDownloadUrlInput)
			.output(getDownloadUrlOutput)
			.query(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				const obj = await getStorageObjectForOrg(
					organizationId,
					input.entityId,
				);
				if (obj.status !== "stored") {
					throw new TRPCError({ code: "NOT_FOUND", message: "not stored" });
				}
				const url = await getObjectStore().presignGet(
					obj.bucket,
					obj.objectKey,
					input.expiresInSec,
				);
				return { url, expiresInSec: input.expiresInSec };
			}),

		delete: protectedProcedure
			.input(deleteInput)
			.output(deleteOutput)
			.mutation(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				const obj = await getStorageObjectForOrg(
					organizationId,
					input.entityId,
				);

				if (input.hard) {
					await verifyOrgAdmin(ctx.session.user.id, organizationId);
				} else {
					await requireStorageObjectOwnerOrAdmin(
						ctx.session.user.id,
						organizationId,
						obj,
					);
				}
				const nextStatus = input.hard ? "missing" : "trashed";
				await dbWs
					.update(storageObjects)
					.set({ status: nextStatus })
					.where(
						and(
							eq(storageObjects.organizationId, organizationId),
							eq(storageObjects.entityId, input.entityId),
						),
					);
				if (input.hard) {
					await getObjectStore().delete(obj.bucket, obj.objectKey);
				}
				return { entityId: input.entityId, status: nextStatus };
			}),

		list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const conditions = [
				eq(storageObjects.organizationId, organizationId),
				eq(storageObjects.status, input.status),
			];
			if (input.prefix)
				conditions.push(eq(storageObjects.prefix, input.prefix));
			if (input.v2ProjectId) {
				conditions.push(eq(storageObjects.v2ProjectId, input.v2ProjectId));
			}
			if (input.cursor) {
				const cursorCreatedAt = new Date(input.cursor.createdAt);
				const cursorCondition = or(
					lt(storageObjects.createdAt, cursorCreatedAt),
					and(
						eq(storageObjects.createdAt, cursorCreatedAt),
						lt(storageObjects.entityId, input.cursor.entityId),
					),
				);
				if (cursorCondition) conditions.push(cursorCondition);
			}
			const rows = await db
				.select()
				.from(storageObjects)
				.where(and(...conditions))
				.orderBy(desc(storageObjects.createdAt), desc(storageObjects.entityId))
				.limit(input.limit + 1);
			const items = rows.slice(0, input.limit);
			const last = items.at(-1);
			const nextCursor =
				rows.length > input.limit && last
					? { createdAt: last.createdAt.toISOString(), entityId: last.entityId }
					: undefined;
			return { items, nextCursor };
		}),
	},

	// -------------------------------------------------------------------------
	// embedding.*
	// -------------------------------------------------------------------------
	embedding: {
		enqueue: protectedProcedure
			.input(enqueueInput)
			.output(enqueueOutput)
			.mutation(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				const version = input.embeddingVersion ?? EMBEDDING_VERSION;

				if (NON_INDEXABLE_KINDS.has(input.kind)) {
					return { jobId: crypto.randomUUID(), status: "skipped" as const };
				}

				return dbWs.transaction(async (tx) => {
					const [entity] = await tx
						.select({ id: entities.id })
						.from(entities)
						.where(
							and(
								eq(entities.organizationId, organizationId),
								eq(entities.id, input.entityId),
								eq(entities.kind, input.kind),
							),
						)
						.limit(1);
					if (!entity) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "entity not found",
						});
					}

					const [active] = await tx
						.select()
						.from(embeddingJobs)
						.where(
							and(
								eq(embeddingJobs.organizationId, organizationId),
								eq(embeddingJobs.entityId, input.entityId),
								eq(embeddingJobs.embeddingVersion, version),
								inArray(embeddingJobs.status, ["queued", "running"]),
							),
						)
						.for("update")
						.limit(1);

					// Same content already queued/running → no-op.
					if (active && active.contentHash === (input.contentHash ?? null)) {
						return { jobId: active.id, status: active.status };
					}
					// Content changed → supersede the stale active job.
					if (active) {
						await tx
							.update(embeddingJobs)
							.set({ status: "skipped", finishedAt: new Date() })
							.where(eq(embeddingJobs.id, active.id));
					}

					const [job] = await tx
						.insert(embeddingJobs)
						.values({
							organizationId,
							entityId: input.entityId,
							kind: input.kind,
							provider: input.provider,
							embeddingVersion: version,
							contentHash: input.contentHash ?? null,
							payload: input.payload,
							status: "queued",
						})
						.returning({ id: embeddingJobs.id, status: embeddingJobs.status });
					if (!job) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
					return { jobId: job.id, status: job.status };
				});
			}),

		claimBatch: serviceProcedure
			.input(claimBatchInput)
			.output(claimBatchOutput)
			.mutation(async ({ input }) => {
				const now = new Date();
				return dbWs.transaction(async (tx) => {
					// Atomic claim: SELECT FOR UPDATE SKIP LOCKED, then mark running.
					const claimable = await tx
						.select()
						.from(embeddingJobs)
						.where(
							and(
								eq(embeddingJobs.organizationId, input.organizationId),
								eq(embeddingJobs.status, "queued"),
								lte(embeddingJobs.scheduledAt, now),
							),
						)
						.orderBy(asc(embeddingJobs.scheduledAt))
						.limit(input.limit)
						.for("update", { skipLocked: true });

					if (claimable.length === 0) return { jobs: [] };

					const ids = claimable.map((j) => j.id);
					await tx
						.update(embeddingJobs)
						.set({ status: "running", startedAt: now })
						.where(inArray(embeddingJobs.id, ids));

					// Build embedText per job from the node (domain resolver registry).
					const entityIds = claimable.map((j) => j.entityId);
					const nodes = await tx
						.select()
						.from(entities)
						.where(
							and(
								eq(entities.organizationId, input.organizationId),
								inArray(entities.id, entityIds),
							),
						);
					const byId = new Map(nodes.map((n) => [n.id, n]));

					const jobs = claimable.map((j) => {
						const node = byId.get(j.entityId);
						const embedText = node
							? embedTextForEntity({
									kind: node.kind,
									title: node.title,
									markdown: node.markdown,
									body: node.body,
								})
							: "";
						return {
							jobId: j.id,
							entityId: j.entityId,
							kind: j.kind as EntityKind,
							provider: j.provider,
							embeddingVersion: j.embeddingVersion,
							embedText,
						};
					});
					return { jobs };
				});
			}),

		complete: serviceProcedure
			.input(completeInput)
			.output(completeOutput)
			.mutation(async ({ input }) => {
				return dbWs.transaction(async (tx) => {
					const [job] = await tx
						.select()
						.from(embeddingJobs)
						.where(
							and(
								eq(embeddingJobs.organizationId, input.organizationId),
								eq(embeddingJobs.id, input.jobId),
							),
						)
						.for("update")
						.limit(1);
					if (!job) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "job not found",
						});
					}
					// Idempotent on a terminal status.
					if (["done", "failed", "skipped"].includes(job.status)) {
						return { jobId: job.id, status: job.status };
					}

					const now = new Date();
					if (input.outcome === "failed") {
						const attempts = job.attempts + 1;
						const status = attempts >= MAX_EMBED_ATTEMPTS ? "failed" : "queued";
						const [updated] = await tx
							.update(embeddingJobs)
							.set({
								status,
								attempts,
								lastError: input.error ?? "embedding failed",
								finishedAt: status === "failed" ? now : null,
								scheduledAt: status === "queued" ? now : job.scheduledAt,
							})
							.where(eq(embeddingJobs.id, job.id))
							.returning({ status: embeddingJobs.status });
						if (!updated) {
							throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
						}
						return { jobId: job.id, status: updated.status };
					}

					const [updated] = await tx
						.update(embeddingJobs)
						.set({ status: input.outcome, finishedAt: now })
						.where(eq(embeddingJobs.id, job.id))
						.returning({ status: embeddingJobs.status });
					if (!updated) {
						throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
					}
					return { jobId: job.id, status: updated.status };
				});
			}),
	},

	// -------------------------------------------------------------------------
	// vector.*
	// -------------------------------------------------------------------------
	vector: {
		search: protectedProcedure
			.input(vectorSearchInput)
			.output(vectorSearchOutput)
			.query(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				const { collection } = runtimeClientConfig().vectorStore;
				try {
					let vector = input.vector;
					if (!vector && input.queryText) {
						const [embedded] = await getEmbedder().embed([input.queryText]);
						vector = embedded;
					}
					if (!vector) return { hits: [], degraded: true };

					// Mandatory multitenant filter — orgId can never be relaxed.
					const must: Record<string, unknown>[] = [
						{ key: "orgId", match: { value: organizationId } },
					];
					if (input.kinds?.length) {
						must.push({ key: "kind", match: { any: input.kinds } });
					}
					if (input.v2ProjectId) {
						must.push({
							key: "v2ProjectId",
							match: { value: input.v2ProjectId },
						});
					}
					if (input.tags?.length) {
						must.push({ key: "tags", match: { any: input.tags } });
					}

					const hits = await getVectorStore().search(
						collection || QDRANT_COLLECTION,
						vector,
						{ must },
						input.limit,
						input.scoreThreshold,
					);
					return {
						hits: hits.map((h) => ({
							entityId: String(h.id),
							kind: (h.payload.kind as EntityKind | undefined) ?? "note",
							score: h.score,
						})),
						degraded: false,
					};
				} catch (error) {
					console.warn("Runtime vector search degraded", { error });
					// qdrant/embedder down → degrade, never throw (caller falls back
					// to keyword search). AC 10.
					return { hits: [], degraded: true };
				}
			}),

		reindex: protectedProcedure
			.input(reindexInput)
			.output(reindexOutput)
			.mutation(async ({ ctx, input }) => {
				const organizationId = await requireActiveOrgMembership(ctx);
				await verifyOrgAdmin(ctx.session.user.id, organizationId);
				const version = input.bumpVersion
					? EMBEDDING_VERSION + 1
					: EMBEDDING_VERSION;

				let lastId: string | null = null;
				let enqueued = 0;
				for (;;) {
					const conditions = [eq(entities.organizationId, organizationId)];
					if (input.kinds?.length) {
						conditions.push(inArray(entities.kind, input.kinds));
					}
					if (lastId) {
						conditions.push(gt(entities.id, lastId));
					}
					const nodes = await db
						.select({
							id: entities.id,
							kind: entities.kind,
							v2ProjectId: entities.v2ProjectId,
							updatedAt: entities.updatedAt,
						})
						.from(entities)
						.where(and(...conditions))
						.orderBy(asc(entities.id))
						.limit(REINDEX_BATCH_SIZE);

					if (nodes.length === 0) break;

					const jobs: InsertEmbeddingJob[] = [];
					for (const node of nodes) {
						if (NON_INDEXABLE_KINDS.has(node.kind)) continue;
						jobs.push({
							organizationId,
							entityId: node.id,
							kind: node.kind,
							embeddingVersion: version,
							payload: {
								kind: node.kind,
								v2ProjectId: node.v2ProjectId ?? undefined,
								updatedAt: node.updatedAt.toISOString(),
							},
							status: "queued",
						});
					}
					if (jobs.length > 0) {
						const inserted = await dbWs
							.insert(embeddingJobs)
							.values(jobs)
							.onConflictDoNothing()
							.returning({ id: embeddingJobs.id });
						enqueued += inserted.length;
					}
					lastId = nodes.at(-1)?.id ?? null;
				}
				return { enqueued, embeddingVersion: version };
			}),
	},

	// -------------------------------------------------------------------------
	// runtime.claim — strict single-writer claim via an atomic CAS lease.
	// -------------------------------------------------------------------------
	// Backs `@rox/agent-state`'s Postgres-arbitrated claim path. libSQL is
	// last-writer-wins and CANNOT arbitrate mutual exclusion, so the lease is
	// resolved here by a SINGLE conditional upsert against `agent_state_claims`:
	//
	//   INSERT ... ON CONFLICT (org, scope, scope_id, key) DO UPDATE
	//     SET owner_device = excluded.owner_device, lease_expires_at = ...
	//     WHERE existing.lease_expires_at <= now()         -- expired → takeover
	//        OR existing.owner_device     = excluded.owner_device  -- same owner → renew
	//   RETURNING owner_device
	//
	// Postgres evaluates the conflict + WHERE atomically under the row lock, so
	// the grant decision is race-free even with concurrent claimers:
	//   • no existing row            → INSERT wins  → granted
	//   • expired lease              → UPDATE wins  → granted (takeover)
	//   • same owner (live or not)   → UPDATE wins  → granted (idempotent renew)
	//   • live lease, other owner    → WHERE fails  → 0 rows → refused (held)
	// A refusal re-reads the live holder so callers learn who owns it. The op
	// is idempotent and safe under retries (a retry by the same owner renews).
	claim: serviceProcedure
		.input(claimInput)
		.output(claimOutput)
		.mutation(async ({ input }) => {
			const now = new Date();
			const leaseExpiresAt = new Date(now.getTime() + input.leaseSec * 1000);

			return dbWs.transaction(async (tx) => {
				const granted = await tx
					.insert(agentStateClaims)
					.values({
						organizationId: input.orgId,
						scope: input.scope,
						scopeId: input.scopeId,
						key: input.key,
						ownerDevice: input.deviceId,
						leaseExpiresAt,
						claimedAt: now,
					})
					.onConflictDoUpdate({
						target: [
							agentStateClaims.organizationId,
							agentStateClaims.scope,
							agentStateClaims.scopeId,
							agentStateClaims.key,
						],
						set: {
							ownerDevice: sql`excluded.owner_device`,
							leaseExpiresAt: sql`excluded.lease_expires_at`,
							claimedAt: sql`excluded.claimed_at`,
							updatedAt: now,
						},
						// Grant only when the current lease is reclaimable: expired, or
						// already held by this same device (idempotent renewal).
						setWhere: or(
							lte(agentStateClaims.leaseExpiresAt, now),
							eq(agentStateClaims.ownerDevice, input.deviceId),
						),
					})
					.returning({ ownerDevice: agentStateClaims.ownerDevice });

				const owner = granted[0]?.ownerDevice;
				if (owner === input.deviceId) {
					return { ok: true, ownerDevice: owner };
				}

				// CAS refused: a live lease is held by another device. Re-read the
				// current holder so the caller can surface contention. (Empty only
				// under a concurrent delete — treat as transient contention.)
				const [held] = await tx
					.select({ ownerDevice: agentStateClaims.ownerDevice })
					.from(agentStateClaims)
					.where(
						and(
							eq(agentStateClaims.organizationId, input.orgId),
							eq(agentStateClaims.scope, input.scope),
							eq(agentStateClaims.scopeId, input.scopeId),
							eq(agentStateClaims.key, input.key),
						),
					)
					.limit(1);

				return {
					ok: false,
					reason: "held",
					...(held?.ownerDevice ? { ownerDevice: held.ownerDevice } : {}),
				};
			});
		}),

	// -------------------------------------------------------------------------
	// runtime.*
	// -------------------------------------------------------------------------
	health: protectedProcedure
		.input(healthInput)
		.output(healthOutput)
		.query(async ({ ctx }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rows = await db
				.select()
				.from(runtimeServices)
				.where(eq(runtimeServices.organizationId, organizationId));
			// Never expose `secretKeys` (§2.1 #11).
			return {
				services: rows.map((r) => ({
					kind: r.kind,
					state: r.state,
					endpoint: r.endpoint ?? undefined,
					version: r.version ?? undefined,
					lastHealthAt: r.lastHealthAt?.toISOString() ?? null,
					health: r.health,
				})),
			};
		}),

	reportHealth: serviceProcedure
		.input(reportHealthInput)
		.output(reportHealthOutput)
		.mutation(async ({ input }) => {
			if (input.kind === "electric") {
				// Electric is managed by docker-compose, not host-service (ОВ-7).
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "electric is not reported via reportHealth",
				});
			}
			const values = {
				organizationId: input.organizationId,
				kind: input.kind,
				state: input.state,
				deviceId: input.deviceId ?? null,
				endpoint: input.endpoint ?? null,
				version: input.version ?? null,
				secretKeys: input.secretKeys ?? [],
				lastHealthAt: new Date(),
				health: input.health ?? {},
			};
			const target = input.deviceId
				? [
						runtimeServices.organizationId,
						runtimeServices.kind,
						runtimeServices.deviceId,
					]
				: [runtimeServices.organizationId, runtimeServices.kind];
			const targetWhere = input.deviceId
				? sql`${runtimeServices.deviceId} IS NOT NULL`
				: sql`${runtimeServices.deviceId} IS NULL`;
			await dbWs
				.insert(runtimeServices)
				.values(values)
				.onConflictDoUpdate({
					target,
					targetWhere,
					set: {
						state: values.state,
						endpoint: values.endpoint,
						version: values.version,
						secretKeys: values.secretKeys,
						lastHealthAt: values.lastHealthAt,
						health: values.health,
					},
				});
			return { ok: true as const };
		}),

	// -------------------------------------------------------------------------
	// sync.*
	// -------------------------------------------------------------------------
	electricToken: protectedProcedure
		.input(electricTokenInput)
		.output(electricTokenOutput)
		.query(async ({ ctx }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Scope the token to the active org (membership verified above).
			const ttlSeconds = 300;
			const token = await mintUserJwt({
				userId: ctx.session.user.id,
				email: ctx.session.user.email ?? "",
				organizationIds: [organizationId],
				scope: "electric:down-sync",
				ttlSeconds,
			});
			return { token, expiresInSec: ttlSeconds };
		}),

	saveCursor: protectedProcedure
		.input(saveCursorInput)
		.output(saveCursorOutput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const lastSyncedAt = input.lastSyncedAt
				? new Date(input.lastSyncedAt)
				: new Date();
			await dbWs
				.insert(syncCursors)
				.values({
					organizationId,
					userId: ctx.session.user.id,
					deviceId: input.deviceId,
					shape: input.shape,
					electricHandle: input.electricHandle ?? null,
					electricOffset: input.electricOffset ?? null,
					lastSyncedAt,
				})
				.onConflictDoUpdate({
					target: [
						syncCursors.organizationId,
						syncCursors.deviceId,
						syncCursors.shape,
					],
					set: {
						userId: ctx.session.user.id,
						electricHandle: input.electricHandle ?? null,
						electricOffset: input.electricOffset ?? null,
						lastSyncedAt,
					},
				});
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
