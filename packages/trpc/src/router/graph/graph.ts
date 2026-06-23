/**
 * Graph core (#01) — `graphRouter` (spec §2.1).
 *
 * A thin tRPC wrapper over the graph-service for direct UI calls (command-bar,
 * graph view, universal "create node"). Writes run in `dbWs.transaction` and
 * delegate to `graphService` (the only writer of entities/edges); reads use
 * `db`. Org scope via `requireActiveOrgMembership` (mirrors `knowledge.ts`).
 */

import { db, dbWs } from "@rox/db/client";
import { edges, entities, v2Projects } from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
	createGraphSearchService,
	graphService,
	loadProjectGraph,
} from "../../lib/graph";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	graphArchiveSchema,
	graphBacklinksSchema,
	graphCreateSchema,
	graphGetSchema,
	graphLinkSchema,
	graphListByKindSchema,
	graphNeighborsSchema,
	graphProjectGraphSchema,
	graphPromoteSchema,
	graphRecordActivitySchema,
	graphResolveIdentitySchema,
	graphSearchSchema,
	graphUpdateSchema,
} from "./schema";

// Search service with no #02 client wired yet → keyword-only (degraded:true on
// semantic). The runtime (#02) re-creates this with `{ semanticSearch }`.
const searchService = createGraphSearchService();

export const graphRouter = {
	create: protectedProcedure
		.input(graphCreateSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction((tx) =>
				graphService.create(tx, {
					orgId: organizationId,
					kind: input.kind,
					title: input.title,
					slug: input.slug ?? null,
					markdown: input.markdown ?? null,
					body: input.body ?? null,
					storageRef: input.storageRef ?? null,
					sourceRef: input.sourceRef ?? null,
					v2ProjectId: input.v2ProjectId ?? null,
					createdByUserId: ctx.session.user.id,
					idempotencyKey: input.idempotencyKey,
				}),
			);
		}),

	get: protectedProcedure
		.input(graphGetSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const entity =
				"entityId" in input
					? await graphService.get(db, {
							orgId: organizationId,
							entityId: input.entityId,
						})
					: await graphService.get(db, {
							orgId: organizationId,
							kind: input.kind,
							slug: input.slug,
						});
			if (!entity) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
			}
			return entity;
		}),

	update: protectedProcedure
		.input(graphUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction((tx) =>
				graphService.update(tx, {
					orgId: organizationId,
					entityId: input.entityId,
					title: input.title,
					slug: input.slug,
					markdown: input.markdown,
					body: input.body,
					status: input.status,
					v2ProjectId: input.v2ProjectId,
				}),
			);
		}),

	archive: protectedProcedure
		.input(graphArchiveSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const entity = await dbWs.transaction((tx) =>
				graphService.archive(tx, {
					orgId: organizationId,
					entityId: input.entityId,
					status: input.status,
				}),
			);
			return { entityId: entity.id, status: entity.status };
		}),

	listByKind: protectedProcedure
		.input(graphListByKindSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const { items, nextCursor } = await graphService.listByKind(db, {
				orgId: organizationId,
				kind: input.kind,
				status: input.status,
				cursor: input.cursor,
				limit: input.limit,
			});
			return {
				items: items.map((e) => ({
					id: e.id,
					kind: e.kind,
					slug: e.slug,
					title: e.title,
					status: e.status,
					updatedAt: e.updatedAt,
				})),
				nextCursor,
			};
		}),

	link: protectedProcedure
		.input(graphLinkSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction((tx) =>
				graphService.link(tx, {
					orgId: organizationId,
					sourceEntityId: input.sourceEntityId,
					targetEntityId: input.targetEntityId ?? null,
					targetSlug: input.targetSlug ?? null,
					relation: input.relation,
					metadata: input.metadata,
					idempotencyKey: input.idempotencyKey,
				}),
			);
		}),

	promote: protectedProcedure
		.input(graphPromoteSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return dbWs.transaction((tx) =>
				graphService.promote(tx, {
					orgId: organizationId,
					sourceEntityId: input.sourceEntityId,
					toKind: input.toKind,
					title: input.title,
					markdown: input.markdown ?? null,
					relation: input.relation,
					createdByUserId: ctx.session.user.id,
					idempotencyKey: input.idempotencyKey,
				}),
			);
		}),

	neighbors: protectedProcedure
		.input(graphNeighborsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Validate the focus node belongs to this org.
			const [focus] = await db
				.select({ id: entities.id })
				.from(entities)
				.where(
					and(
						eq(entities.organizationId, organizationId),
						eq(entities.id, input.entityId),
					),
				)
				.limit(1);
			if (!focus) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
			}

			const relationFilter =
				input.relations && input.relations.length > 0
					? inArray(edges.relation, input.relations)
					: undefined;

			// Resolved edges incident to the focus node (depth 1).
			const incident = await db
				.select()
				.from(edges)
				.where(
					and(
						eq(edges.organizationId, organizationId),
						eq(edges.resolved, true),
						or(
							eq(edges.sourceEntityId, input.entityId),
							eq(edges.targetEntityId, input.entityId),
						),
						...(relationFilter ? [relationFilter] : []),
					),
				)
				.limit(input.limit);

			const neighborIds = new Set<string>([input.entityId]);
			for (const e of incident) {
				neighborIds.add(e.sourceEntityId);
				if (e.targetEntityId) neighborIds.add(e.targetEntityId);
			}

			let truncated = incident.length >= input.limit;
			const edgeRows = [...incident];

			// depth 2: expand from the depth-1 neighbors, bounded by `limit` nodes.
			if (input.depth >= 2 && neighborIds.size < input.limit) {
				const frontier = [...neighborIds].filter((id) => id !== input.entityId);
				if (frontier.length > 0) {
					const second = await db
						.select()
						.from(edges)
						.where(
							and(
								eq(edges.organizationId, organizationId),
								eq(edges.resolved, true),
								or(
									inArray(edges.sourceEntityId, frontier),
									inArray(edges.targetEntityId, frontier),
								),
								...(relationFilter ? [relationFilter] : []),
							),
						)
						.limit(input.limit);
					const seen = new Set(edgeRows.map((e) => e.id));
					for (const e of second) {
						if (seen.has(e.id)) continue;
						if (neighborIds.size >= input.limit) {
							truncated = true;
							break;
						}
						edgeRows.push(e);
						neighborIds.add(e.sourceEntityId);
						if (e.targetEntityId) neighborIds.add(e.targetEntityId);
					}
				}
			}

			const nodeRows = await db
				.select({
					id: entities.id,
					kind: entities.kind,
					title: entities.title,
					slug: entities.slug,
				})
				.from(entities)
				.where(
					and(
						eq(entities.organizationId, organizationId),
						inArray(entities.id, [...neighborIds]),
					),
				);

			return {
				nodes: nodeRows.map((n) => ({
					entityId: n.id,
					kind: n.kind,
					title: n.title,
					slug: n.slug,
				})),
				edges: edgeRows.map((e) => ({
					id: e.id,
					sourceEntityId: e.sourceEntityId,
					targetEntityId: e.targetEntityId,
					relation: e.relation,
					resolved: e.resolved,
				})),
				truncated,
			};
		}),

	// Project OS (#01, Phase-1): the object graph of one v2_project — its nodes
	// (entities with v2_project_id = P) plus the resolved edges incident to them.
	// Read-only; reuses entities/edges directly via `loadProjectGraph`.
	projectGraph: protectedProcedure
		.input(graphProjectGraphSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Validate the project belongs to this org before walking its graph.
			const [project] = await db
				.select({ id: v2Projects.id })
				.from(v2Projects)
				.where(
					and(
						eq(v2Projects.organizationId, organizationId),
						eq(v2Projects.id, input.v2ProjectId),
					),
				)
				.limit(1);
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}

			const result = await loadProjectGraph(db, {
				orgId: organizationId,
				v2ProjectId: input.v2ProjectId,
				status: input.status,
				limit: input.limit,
			});
			return result;
		}),

	backlinks: protectedProcedure
		.input(graphBacklinksSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const rows = await db
				.select({
					sourceEntityId: edges.sourceEntityId,
					resolved: edges.resolved,
					sourceSlug: entities.slug,
					sourceTitle: entities.title,
				})
				.from(edges)
				.innerJoin(entities, eq(edges.sourceEntityId, entities.id))
				.where(
					and(
						eq(edges.organizationId, organizationId),
						eq(edges.targetSlug, input.slug),
						eq(edges.relation, input.relation),
					),
				)
				.orderBy(desc(entities.updatedAt));
			return rows.map((r) => ({
				sourceEntityId: r.sourceEntityId,
				sourceSlug: r.sourceSlug,
				sourceTitle: r.sourceTitle,
				resolved: r.resolved,
			}));
		}),

	resolveIdentity: protectedProcedure
		.input(graphResolveIdentitySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const { contact, created } = await dbWs.transaction((tx) =>
				graphService.resolveIdentity(tx, {
					orgId: organizationId,
					kind: input.kind,
					value: input.value,
					displayName: input.displayName,
					idempotencyKey: input.idempotencyKey,
				}),
			);
			return { contactEntityId: contact.id, created };
		}),

	search: protectedProcedure
		.input(graphSearchSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const { hits, degraded } = await searchService.search({
				orgId: organizationId,
				query: input.query,
				kinds: input.kinds,
				mode: input.mode,
				v2ProjectId: input.v2ProjectId,
				status: input.status,
				limit: input.limit,
			});
			return {
				hits: hits.map((h) => ({
					id: h.id,
					kind: h.kind,
					slug: h.slug,
					title: h.title,
					status: h.status as "active" | "archived" | "trashed",
					updatedAt: h.updatedAt,
					score: h.score,
					snippet: h.snippet,
				})),
				degraded,
			};
		}),

	recordActivity: protectedProcedure
		.input(graphRecordActivitySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const event = await dbWs.transaction((tx) =>
				graphService.recordActivity(tx, {
					organizationId,
					userId: ctx.session.user.id,
					ts: input.ts,
					durationMs: input.durationMs ?? null,
					kind: input.kind,
					sourceEntityId: input.sourceEntityId ?? null,
					payload: input.payload ?? {},
					idempotencyKey: input.idempotencyKey,
				}),
			);
			return { id: event.id };
		}),
} satisfies TRPCRouterRecord;
