/**
 * Graph core (#01) — the graph-service (spec §2).
 *
 * The ONLY writer of `entities`/`edges`. Domain subsystems import this service
 * and call `create/update/link/promote/resolveBacklinks/resolveIdentity` inside
 * their own `dbWs.transaction`, writing only their detail tables — they never
 * INSERT into `entities`/`edges` directly. This guarantees the "one writer per
 * node" invariant.
 *
 * All mutating methods take a `GraphTx` so they compose into a caller's
 * transaction; reads take a `GraphDb`. Idempotency uses the atomic claim
 * protocol (`./idempotency`): a unique-violation is never surfaced as a 5xx.
 */

import {
	type ActivityEventKind,
	activityEvents as activityEventsTable,
	contacts,
	type EdgeRelation,
	type EntityKind,
	type EntityStatus,
	edges,
	entities,
	type IdentityKind,
	type InsertActivityEvent,
	identityLinks,
	type SelectActivityEvent,
	type SelectEdge,
	type SelectEntity,
} from "@rox/db/schema";
import { assertMdxSafe } from "@rox/shared/knowledge";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import { normalizeIdentityValue } from "./embed";
import { claimIdempotencyKey, finalizeIdempotencyKey } from "./idempotency";
import { resolveIncomingLinks, syncOutgoingLinks } from "./links";
import type { GraphDb, GraphTx } from "./types";

/** Max inline bytes for `markdown` + `body` (UTF-8). Larger → use storageRef. */
export const MAX_INLINE_BYTES = 4 * 1024 * 1024;

export interface GraphCreateInput {
	orgId: string;
	kind: EntityKind;
	title: string;
	slug?: string | null;
	markdown?: string | null;
	body?: Record<string, unknown> | null;
	storageRef?: {
		bucket?: string;
		key?: string;
		mime?: string;
		size?: number;
	} | null;
	sourceRef?: Record<string, unknown> | null;
	v2ProjectId?: string | null;
	status?: EntityStatus;
	createdByUserId?: string | null;
	/** Required for side-effecting create via the router (scope `graph.create`). */
	idempotencyKey?: string;
}

export interface GraphUpdateInput {
	orgId: string;
	entityId: string;
	title?: string;
	slug?: string | null;
	markdown?: string | null;
	body?: Record<string, unknown> | null;
	status?: EntityStatus;
	v2ProjectId?: string | null;
}

export interface GraphLinkInput {
	orgId: string;
	sourceEntityId: string;
	targetEntityId?: string | null;
	targetSlug?: string | null;
	relation: EdgeRelation;
	metadata?: Record<string, unknown>;
	idempotencyKey?: string;
}

export interface GraphPromoteInput {
	orgId: string;
	sourceEntityId: string;
	toKind: EntityKind;
	title: string;
	markdown?: string | null;
	relation?: EdgeRelation;
	createdByUserId?: string | null;
	idempotencyKey?: string;
}

export interface GraphService {
	create(tx: GraphTx, input: GraphCreateInput): Promise<SelectEntity>;
	get(
		db: GraphDb,
		p: { orgId: string; entityId?: string; kind?: EntityKind; slug?: string },
	): Promise<SelectEntity | null>;
	update(tx: GraphTx, input: GraphUpdateInput): Promise<SelectEntity>;
	archive(
		tx: GraphTx,
		p: { orgId: string; entityId: string; status: EntityStatus },
	): Promise<SelectEntity>;
	listByKind(
		db: GraphDb,
		p: {
			orgId: string;
			kind: EntityKind;
			status?: EntityStatus;
			cursor?: string;
			limit: number;
		},
	): Promise<{ items: SelectEntity[]; nextCursor?: string }>;
	link(tx: GraphTx, input: GraphLinkInput): Promise<SelectEdge>;
	promote(
		tx: GraphTx,
		input: GraphPromoteInput,
	): Promise<{ entity: SelectEntity; edge: SelectEdge }>;
	resolveBacklinks(
		tx: GraphTx,
		p: { orgId: string; entityId: string; slug: string },
	): Promise<number>;
	resolveIdentity(
		tx: GraphTx,
		p: {
			orgId: string;
			kind: IdentityKind;
			value: string;
			displayName?: string;
			idempotencyKey?: string;
		},
	): Promise<{ contact: SelectEntity; created: boolean }>;
	recordActivity(
		tx: GraphTx,
		input: InsertActivityEvent & { idempotencyKey?: string },
	): Promise<SelectActivityEvent>;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function assertInlineSize(input: {
	markdown?: string | null;
	body?: Record<string, unknown> | null;
}): void {
	const bytes = Buffer.byteLength(
		JSON.stringify({ markdown: input.markdown ?? "", body: input.body ?? {} }),
		"utf8",
	);
	if (bytes > MAX_INLINE_BYTES) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: `Inline node body exceeds ${MAX_INLINE_BYTES} bytes; store large content in minio via storageRef.`,
		});
	}
}

/** Fetch a node by id within the given org, or throw NOT_FOUND. */
async function entityByIdForOrg(
	tx: GraphTx,
	orgId: string,
	entityId: string,
): Promise<SelectEntity> {
	const [row] = await tx
		.select()
		.from(entities)
		.where(and(eq(entities.organizationId, orgId), eq(entities.id, entityId)))
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
	}
	return row;
}

/** Throw CONFLICT if `(org, kind, slug)` is already taken by another node. */
async function assertSlugFree(
	tx: GraphTx,
	orgId: string,
	kind: EntityKind,
	slug: string,
	exceptEntityId?: string,
): Promise<void> {
	const [existing] = await tx
		.select({ id: entities.id })
		.from(entities)
		.where(
			and(
				eq(entities.organizationId, orgId),
				eq(entities.kind, kind),
				eq(entities.slug, slug),
			),
		)
		.limit(1);
	if (existing && existing.id !== exceptEntityId) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Slug "${slug}" already exists for kind "${kind}"`,
		});
	}
}

async function insertEntity(
	tx: GraphTx,
	input: GraphCreateInput,
): Promise<SelectEntity> {
	const [row] = await tx
		.insert(entities)
		.values({
			organizationId: input.orgId,
			v2ProjectId: input.v2ProjectId ?? null,
			kind: input.kind,
			slug: input.slug ?? null,
			title: input.title,
			markdown: input.markdown ?? null,
			body: input.body ?? null,
			storageRef: input.storageRef ?? null,
			sourceRef: input.sourceRef ?? null,
			status: input.status ?? "active",
			createdByUserId: input.createdByUserId ?? null,
		})
		.returning();
	if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return row;
}

async function findContactByIdentity(
	tx: GraphTx,
	orgId: string,
	kind: IdentityKind,
	value: string,
): Promise<SelectEntity | null> {
	const [link] = await tx
		.select({ contactEntityId: identityLinks.contactEntityId })
		.from(identityLinks)
		.where(
			and(
				eq(identityLinks.organizationId, orgId),
				eq(identityLinks.kind, kind),
				eq(identityLinks.value, value),
			),
		)
		.limit(1);
	if (!link) return null;
	const [contact] = await tx
		.select()
		.from(entities)
		.where(
			and(
				eq(entities.organizationId, orgId),
				eq(entities.id, link.contactEntityId),
			),
		)
		.limit(1);
	return contact ?? null;
}

async function createContactNode(
	tx: GraphTx,
	orgId: string,
	displayName: string,
): Promise<SelectEntity> {
	const [contact] = await tx
		.insert(entities)
		.values({
			organizationId: orgId,
			kind: "contact",
			title: displayName,
		})
		.returning();
	if (!contact) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return contact;
}

async function insertContactDetailAndIdentity(
	tx: GraphTx,
	params: {
		orgId: string;
		contactId: string;
		kind: IdentityKind;
		value: string;
		displayName: string;
	},
): Promise<void> {
	await tx.insert(contacts).values({
		entityId: params.contactId,
		organizationId: params.orgId,
		displayName: params.displayName,
		primaryEmail: params.kind === "email" ? params.value : null,
	});
	await tx.insert(identityLinks).values({
		organizationId: params.orgId,
		contactEntityId: params.contactId,
		kind: params.kind,
		value: params.value,
	});
}

async function insertActivity(
	tx: GraphTx,
	input: InsertActivityEvent,
): Promise<SelectActivityEvent> {
	if (input.sourceEntityId) {
		await entityByIdForOrg(tx, input.organizationId, input.sourceEntityId);
	}
	const [event] = await tx
		.insert(activityEventsTable)
		.values({
			organizationId: input.organizationId,
			userId: input.userId,
			ts: input.ts,
			durationMs: input.durationMs ?? null,
			kind: input.kind as ActivityEventKind,
			sourceEntityId: input.sourceEntityId ?? null,
			payload: input.payload ?? {},
		})
		.returning();
	if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
	return event;
}

/** Sync outgoing wikilinks + back-fill incoming references for a written node. */
async function reindexNodeLinks(
	tx: GraphTx,
	orgId: string,
	entity: SelectEntity,
	markdownWasSet: boolean,
): Promise<void> {
	if (markdownWasSet) {
		await syncOutgoingLinks(tx, {
			organizationId: orgId,
			sourceEntityId: entity.id,
			markdown: entity.markdown,
		});
	}
	if (entity.slug) {
		await resolveIncomingLinks(tx, {
			organizationId: orgId,
			entityId: entity.id,
			slug: entity.slug,
		});
	}
}

// ---------------------------------------------------------------------------
// graphService
// ---------------------------------------------------------------------------

export const graphService: GraphService = {
	async create(tx, input) {
		if (input.markdown) assertMdxSafe(input.markdown);
		assertInlineSize(input);

		if (input.idempotencyKey) {
			const claim = await claimIdempotencyKey(tx, {
				organizationId: input.orgId,
				scope: "graph.create",
				key: input.idempotencyKey,
			});
			if (!claim.claimed) {
				const cachedId = claim.existing?.resultEntityId;
				if (cachedId) return entityByIdForOrg(tx, input.orgId, cachedId);
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Concurrent create with the same idempotency key is in progress",
				});
			}
			if (input.slug) {
				await assertSlugFree(tx, input.orgId, input.kind, input.slug);
			}
			const entity = await insertEntity(tx, input);
			await finalizeIdempotencyKey(tx, {
				id: claim.id,
				resultEntityId: entity.id,
			});
			await reindexNodeLinks(
				tx,
				input.orgId,
				entity,
				input.markdown !== undefined,
			);
			return entity;
		}

		if (input.slug) {
			await assertSlugFree(tx, input.orgId, input.kind, input.slug);
		}
		const entity = await insertEntity(tx, input);
		await reindexNodeLinks(
			tx,
			input.orgId,
			entity,
			input.markdown !== undefined,
		);
		return entity;
	},

	async get(db, p) {
		const condition = p.entityId
			? eq(entities.id, p.entityId)
			: p.kind && p.slug
				? and(eq(entities.kind, p.kind), eq(entities.slug, p.slug))
				: undefined;
		if (!condition) return null;
		const [row] = await db
			.select()
			.from(entities)
			.where(and(eq(entities.organizationId, p.orgId), condition))
			.limit(1);
		return row ?? null;
	},

	async update(tx, input) {
		const existing = await entityByIdForOrg(tx, input.orgId, input.entityId);
		if (input.markdown !== undefined && input.markdown) {
			assertMdxSafe(input.markdown);
		}
		const nextMarkdown =
			input.markdown !== undefined ? input.markdown : existing.markdown;
		const nextBody = input.body !== undefined ? input.body : existing.body;
		assertInlineSize({
			markdown: nextMarkdown,
			body: nextBody,
		});
		const slugChanged =
			input.slug !== undefined && input.slug !== existing.slug;
		if (slugChanged && input.slug) {
			await assertSlugFree(
				tx,
				input.orgId,
				existing.kind,
				input.slug,
				existing.id,
			);
		}

		const [row] = await tx
			.update(entities)
			.set({
				title: input.title ?? existing.title,
				slug: input.slug !== undefined ? input.slug : existing.slug,
				markdown:
					input.markdown !== undefined ? input.markdown : existing.markdown,
				body: input.body !== undefined ? input.body : existing.body,
				status: input.status ?? existing.status,
				v2ProjectId:
					input.v2ProjectId !== undefined
						? input.v2ProjectId
						: existing.v2ProjectId,
			})
			.where(
				and(
					eq(entities.organizationId, input.orgId),
					eq(entities.id, input.entityId),
				),
			)
			.returning();
		if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

		if (input.markdown !== undefined) {
			await syncOutgoingLinks(tx, {
				organizationId: input.orgId,
				sourceEntityId: row.id,
				markdown: row.markdown,
			});
		}
		if (slugChanged && row.slug) {
			await resolveIncomingLinks(tx, {
				organizationId: input.orgId,
				entityId: row.id,
				slug: row.slug,
			});
		}
		return row;
	},

	async archive(tx, p) {
		const existing = await entityByIdForOrg(tx, p.orgId, p.entityId);
		if (existing.status === p.status) return existing; // idempotent
		const [row] = await tx
			.update(entities)
			.set({ status: p.status })
			.where(
				and(eq(entities.organizationId, p.orgId), eq(entities.id, p.entityId)),
			)
			.returning();
		if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
		return row;
	},

	async listByKind(db, p) {
		const status = p.status ?? "active";
		const conditions = [
			eq(entities.organizationId, p.orgId),
			eq(entities.kind, p.kind),
			eq(entities.status, status),
		];
		// Keyset on (updatedAt desc, id): rows strictly "after" the cursor row.
		if (p.cursor) {
			const [cursorRow] = await db
				.select({ updatedAt: entities.updatedAt, id: entities.id })
				.from(entities)
				.where(
					and(eq(entities.organizationId, p.orgId), eq(entities.id, p.cursor)),
				)
				.limit(1);
			if (cursorRow) {
				const keyset = or(
					lt(entities.updatedAt, cursorRow.updatedAt),
					and(
						eq(entities.updatedAt, cursorRow.updatedAt),
						gt(entities.id, cursorRow.id),
					),
				);
				if (keyset) conditions.push(keyset);
			}
		}

		const rows = await db
			.select()
			.from(entities)
			.where(and(...conditions))
			.orderBy(desc(entities.updatedAt), entities.id)
			.limit(p.limit + 1);

		const items = rows.slice(0, p.limit);
		const nextCursor =
			rows.length > p.limit ? items[items.length - 1]?.id : undefined;
		return { items, nextCursor };
	},

	async link(tx, input) {
		const hasTarget = !!input.targetEntityId;
		const hasSlug = !!input.targetSlug;
		if (hasTarget === hasSlug) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Provide exactly one of targetEntityId or targetSlug",
			});
		}

		await entityByIdForOrg(tx, input.orgId, input.sourceEntityId);
		if (input.targetEntityId) {
			await entityByIdForOrg(tx, input.orgId, input.targetEntityId);
		}

		let claimId: string | undefined;
		if (input.idempotencyKey) {
			const claim = await claimIdempotencyKey(tx, {
				organizationId: input.orgId,
				scope: "graph.link",
				key: input.idempotencyKey,
			});
			if (!claim.claimed) {
				const cachedId = claim.existing?.resultEntityId;
				if (cachedId) {
					const [cached] = await tx
						.select()
						.from(edges)
						.where(
							and(
								eq(edges.organizationId, input.orgId),
								eq(edges.id, cachedId),
							),
						)
						.limit(1);
					if (cached) return cached;
				}
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Concurrent link with the same idempotency key is in progress",
				});
			}
			claimId = claim.id;
		}

		const resolved = input.targetEntityId != null;
		const [edge] = await tx
			.insert(edges)
			.values({
				organizationId: input.orgId,
				sourceEntityId: input.sourceEntityId,
				targetEntityId: input.targetEntityId ?? null,
				targetSlug: input.targetSlug ?? null,
				resolved,
				relation: input.relation,
				metadata: input.metadata ?? {},
			})
			.onConflictDoNothing()
			.returning();

		// Conflict means the edge already exists under the resolved or unresolved
		// dedupe key, so load the matching row.
		let result = edge;
		if (!result) {
			const targetCondition =
				resolved && input.targetEntityId
					? eq(edges.targetEntityId, input.targetEntityId)
					: eq(edges.targetSlug, input.targetSlug ?? "");
			const [existing] = await tx
				.select()
				.from(edges)
				.where(
					and(
						eq(edges.organizationId, input.orgId),
						eq(edges.sourceEntityId, input.sourceEntityId),
						eq(edges.relation, input.relation),
						targetCondition,
					),
				)
				.limit(1);
			result = existing;
		}
		if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

		if (claimId) {
			await finalizeIdempotencyKey(tx, {
				id: claimId,
				resultEntityId: result.id,
			});
		}
		return result;
	},

	async promote(tx, input) {
		const relation = input.relation ?? "derived_from";
		if (input.markdown) assertMdxSafe(input.markdown);
		assertInlineSize({ markdown: input.markdown ?? null });

		if (input.idempotencyKey) {
			const claim = await claimIdempotencyKey(tx, {
				organizationId: input.orgId,
				scope: "graph.promote",
				key: input.idempotencyKey,
			});
			if (!claim.claimed) {
				const cachedId = claim.existing?.resultEntityId;
				if (cachedId) {
					const entity = await entityByIdForOrg(tx, input.orgId, cachedId);
					const [edge] = await tx
						.select()
						.from(edges)
						.where(
							and(
								eq(edges.organizationId, input.orgId),
								eq(edges.sourceEntityId, cachedId),
								eq(edges.targetEntityId, input.sourceEntityId),
								eq(edges.relation, relation),
							),
						)
						.limit(1);
					if (edge) return { entity, edge };
				}
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Concurrent promote with the same idempotency key is in progress",
				});
			}
			await entityByIdForOrg(tx, input.orgId, input.sourceEntityId);
			const entity = await insertEntity(tx, {
				orgId: input.orgId,
				kind: input.toKind,
				title: input.title,
				markdown: input.markdown ?? null,
				createdByUserId: input.createdByUserId ?? null,
			});
			const edge = await this.link(tx, {
				orgId: input.orgId,
				sourceEntityId: entity.id,
				targetEntityId: input.sourceEntityId,
				relation,
			});
			await finalizeIdempotencyKey(tx, {
				id: claim.id,
				resultEntityId: entity.id,
			});
			if (input.markdown !== undefined) {
				await syncOutgoingLinks(tx, {
					organizationId: input.orgId,
					sourceEntityId: entity.id,
					markdown: entity.markdown,
				});
			}
			return { entity, edge };
		}

		await entityByIdForOrg(tx, input.orgId, input.sourceEntityId);
		const entity = await insertEntity(tx, {
			orgId: input.orgId,
			kind: input.toKind,
			title: input.title,
			markdown: input.markdown ?? null,
			createdByUserId: input.createdByUserId ?? null,
		});
		const edge = await this.link(tx, {
			orgId: input.orgId,
			sourceEntityId: entity.id,
			targetEntityId: input.sourceEntityId,
			relation,
		});
		if (input.markdown !== undefined) {
			await syncOutgoingLinks(tx, {
				organizationId: input.orgId,
				sourceEntityId: entity.id,
				markdown: entity.markdown,
			});
		}
		return { entity, edge };
	},

	async resolveBacklinks(tx, p) {
		return resolveIncomingLinks(tx, {
			organizationId: p.orgId,
			entityId: p.entityId,
			slug: p.slug,
		});
	},

	async resolveIdentity(tx, p) {
		const value = normalizeIdentityValue(p.kind, p.value);
		if (!value) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Empty identity value",
			});
		}
		const displayName = p.displayName ?? value;

		if (p.idempotencyKey) {
			const claim = await claimIdempotencyKey(tx, {
				organizationId: p.orgId,
				scope: "graph.identity",
				key: p.idempotencyKey,
			});
			if (!claim.claimed) {
				if (claim.existing?.resultEntityId) {
					const contact = await entityByIdForOrg(
						tx,
						p.orgId,
						claim.existing.resultEntityId,
					);
					return { contact, created: false };
				}
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Concurrent identity resolution with the same idempotency key is in progress",
				});
			}
			const found = await findContactByIdentity(tx, p.orgId, p.kind, value);
			if (found) {
				await finalizeIdempotencyKey(tx, {
					id: claim.id,
					resultEntityId: found.id,
				});
				return { contact: found, created: false };
			}
			const contact = await createContactNode(tx, p.orgId, displayName);
			await insertContactDetailAndIdentity(tx, {
				orgId: p.orgId,
				contactId: contact.id,
				kind: p.kind,
				value,
				displayName,
			});
			await finalizeIdempotencyKey(tx, {
				id: claim.id,
				resultEntityId: contact.id,
			});
			return { contact, created: true };
		}

		const found = await findContactByIdentity(tx, p.orgId, p.kind, value);
		if (found) return { contact: found, created: false };
		const contact = await createContactNode(tx, p.orgId, displayName);
		await insertContactDetailAndIdentity(tx, {
			orgId: p.orgId,
			contactId: contact.id,
			kind: p.kind,
			value,
			displayName,
		});
		return { contact, created: true };
	},

	async recordActivity(tx, input) {
		if (input.idempotencyKey) {
			const claim = await claimIdempotencyKey(tx, {
				organizationId: input.organizationId,
				scope: "graph.activity",
				key: input.idempotencyKey,
			});
			if (!claim.claimed) {
				if (claim.existing?.resultEntityId) {
					const [existing] = await tx
						.select()
						.from(activityEventsTable)
						.where(
							and(
								eq(activityEventsTable.organizationId, input.organizationId),
								eq(activityEventsTable.id, claim.existing.resultEntityId),
							),
						)
						.limit(1);
					if (existing) return existing;
				}
				throw new TRPCError({
					code: "CONFLICT",
					message:
						"Concurrent activity record with the same idempotency key is in progress",
				});
			}
			const event = await insertActivity(tx, input);
			await finalizeIdempotencyKey(tx, {
				id: claim.id,
				resultEntityId: event.id,
			});
			return event;
		}
		return insertActivity(tx, input);
	},
};
