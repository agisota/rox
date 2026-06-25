/**
 * F16 — cross-entity faceted search router.
 *
 * A SINGLE entry point that searches chat / journal+notes / tasks / drive with
 * one query and returns ranked, entity-agnostic results plus per-facet counts.
 * Every facet uses the SAME `entitySearchVectorSql` its GIN index was built from
 * (via the pure `search-sql` builder), so each scan uses its index.
 *
 * SCOPING:
 *  - `global`  — org-scoped entities the caller owns/can see, + their own drive.
 *  - `project` — only entities tied to one v2 project. Of the searchable
 *                entities, only knowledge documents carry `v2ProjectId`, so the
 *                other facets return empty under a project scope (honest: tasks /
 *                chat / journal / drive have no project FK in the current schema).
 *  - `chat`    — only one session's messages (the other entities aren't
 *                session-scoped). Mirrors the F15 `SearchScope` contract.
 *
 * Per-facet counts are computed with SQL `count(*)` over the SAME match
 * predicate, so they are independent of the page LIMIT (the segment chips show
 * true totals while the list is capped).
 */

import { db } from "@rox/db/client";
import {
	chatMessages,
	driveFiles,
	journalEntries,
	knowledgeDocuments,
	tasks,
} from "@rox/db/schema";
import {
	emptyFacetCounts,
	type SearchEntityKind,
	type SearchFacet,
	type SearchFacetCounts,
	type SearchResponse,
	type SearchResult,
	type SearchScope,
} from "@rox/shared/search";
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { searchSchema } from "./schema";
import { buildFacetSearchSql, normalizeSearchQuery } from "./search-sql";

/** Which facets a scope can yield, intersected with any caller-supplied filter. */
function resolveFacets(
	scope: SearchScope,
	requested: readonly SearchFacet[] | undefined,
): Set<SearchFacet> {
	const eligible: SearchFacet[] =
		scope.type === "chat"
			? ["messages"]
			: ["titles", "messages", "toolCalls", "files"];
	const wanted = requested && requested.length > 0 ? new Set(requested) : null;
	return new Set(
		wanted ? eligible.filter((facet) => wanted.has(facet)) : eligible,
	);
}

/** One facet's outcome: the (capped) page of rows + the full match count. */
interface FacetOutcome {
	results: SearchResult[];
	count: number;
}

const EMPTY_OUTCOME: FacetOutcome = { results: [], count: 0 };

export const searchRouter = {
	/**
	 * Cross-entity faceted search. Returns ranked results across every eligible
	 * facet plus per-facet counts; an empty/whitespace query short-circuits to an
	 * empty response without touching the DB.
	 */
	search: protectedProcedure
		.input(searchSchema)
		.query(async ({ ctx, input }): Promise<SearchResponse> => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const query = normalizeSearchQuery(input.query);

			const facetCounts: SearchFacetCounts = emptyFacetCounts();
			if (!query) {
				return { results: [], facetCounts };
			}

			const facets = resolveFacets(input.scope, input.facets);
			const scope = input.scope;
			const limit = input.limit;

			// ---- titles: knowledge documents + journal reflections -------------
			const titlesOutcome = async (): Promise<FacetOutcome> => {
				if (!facets.has("titles")) return EMPTY_OUTCOME;

				const kn = buildFacetSearchSql({
					query,
					columns: [knowledgeDocuments.title, knowledgeDocuments.markdown],
				});
				const knConds: SQL[] = [
					eq(knowledgeDocuments.organizationId, organizationId),
					kn.match,
				];
				if (scope.type === "project") {
					knConds.push(eq(knowledgeDocuments.v2ProjectId, scope.projectId));
				}

				// journal is org+owner scoped and has no project FK → project scope
				// excludes it.
				const includeJournal = scope.type !== "project";
				const jn = buildFacetSearchSql({
					query,
					columns: [journalEntries.reflection],
				});
				const jnConds: SQL[] = [
					eq(journalEntries.organizationId, organizationId),
					eq(journalEntries.createdBy, userId),
					jn.match,
				];

				const [knCount, jnCount, knRows, jnRows] = await Promise.all([
					db
						.select({ value: count() })
						.from(knowledgeDocuments)
						.where(and(...knConds)),
					includeJournal
						? db
								.select({ value: count() })
								.from(journalEntries)
								.where(and(...jnConds))
						: Promise.resolve([{ value: 0 }]),
					db
						.select({
							id: knowledgeDocuments.id,
							title: knowledgeDocuments.title,
							snippet: kn.headline,
							score: kn.rank,
							updatedAt: knowledgeDocuments.updatedAt,
						})
						.from(knowledgeDocuments)
						.where(and(...knConds))
						.orderBy(
							desc(kn.rank),
							desc(knowledgeDocuments.updatedAt),
							desc(knowledgeDocuments.id),
						)
						.limit(limit),
					includeJournal
						? db
								.select({
									id: journalEntries.id,
									title: journalEntries.reflection,
									snippet: jn.headline,
									score: jn.rank,
									updatedAt: journalEntries.updatedAt,
								})
								.from(journalEntries)
								.where(and(...jnConds))
								.orderBy(
									desc(jn.rank),
									desc(journalEntries.updatedAt),
									desc(journalEntries.id),
								)
								.limit(limit)
						: Promise.resolve([]),
				]);

				const results: SearchResult[] = [
					...knRows.map((row) =>
						toResult(row, "knowledge", "titles", row.title ?? ""),
					),
					...jnRows.map((row) =>
						toResult(row, "journal", "titles", row.title ?? "Журнал"),
					),
				]
					.sort((a, b) => b.score - a.score)
					.slice(0, limit);

				return {
					results,
					count: (knCount[0]?.value ?? 0) + (jnCount[0]?.value ?? 0),
				};
			};

			// ---- messages: chat messages ---------------------------------------
			const messagesOutcome = async (): Promise<FacetOutcome> => {
				if (!facets.has("messages")) return EMPTY_OUTCOME;
				// project scope has no message FK → empty (honest).
				if (scope.type === "project") return EMPTY_OUTCOME;

				const cm = buildFacetSearchSql({
					query,
					columns: [chatMessages.content],
				});
				const conds: SQL[] = [
					eq(chatMessages.organizationId, organizationId),
					eq(chatMessages.createdBy, userId),
					cm.match,
				];
				if (scope.type === "chat") {
					conds.push(eq(chatMessages.sessionId, scope.sessionId));
				}

				const [cnt, rows] = await Promise.all([
					db
						.select({ value: count() })
						.from(chatMessages)
						.where(and(...conds)),
					db
						.select({
							id: chatMessages.id,
							title: chatMessages.content,
							snippet: cm.headline,
							score: cm.rank,
							updatedAt: chatMessages.updatedAt,
						})
						.from(chatMessages)
						.where(and(...conds))
						.orderBy(
							desc(cm.rank),
							desc(chatMessages.updatedAt),
							desc(chatMessages.id),
						)
						.limit(limit),
				]);

				return {
					results: rows.map((row) =>
						toResult(row, "message", "messages", deriveMessageTitle(row.title)),
					),
					count: cnt[0]?.value ?? 0,
				};
			};

			// ---- toolCalls: tasks ----------------------------------------------
			const toolCallsOutcome = async (): Promise<FacetOutcome> => {
				if (!facets.has("toolCalls")) return EMPTY_OUTCOME;
				// tasks have no project FK → empty under project scope (honest).
				if (scope.type === "project") return EMPTY_OUTCOME;

				const tk = buildFacetSearchSql({
					query,
					columns: [tasks.title, tasks.description],
				});
				const conds: SQL[] = [
					eq(tasks.organizationId, organizationId),
					isNull(tasks.deletedAt),
					tk.match,
				];

				const [cnt, rows] = await Promise.all([
					db
						.select({ value: count() })
						.from(tasks)
						.where(and(...conds)),
					db
						.select({
							id: tasks.id,
							title: tasks.title,
							snippet: tk.headline,
							score: tk.rank,
							updatedAt: tasks.updatedAt,
						})
						.from(tasks)
						.where(and(...conds))
						.orderBy(desc(tk.rank), desc(tasks.updatedAt), desc(tasks.id))
						.limit(limit),
				]);

				return {
					results: rows.map((row) =>
						toResult(row, "task", "toolCalls", row.title ?? ""),
					),
					count: cnt[0]?.value ?? 0,
				};
			};

			// ---- files: drive files (user-scoped, not org-scoped) --------------
			const filesOutcome = async (): Promise<FacetOutcome> => {
				if (!facets.has("files")) return EMPTY_OUTCOME;
				// drive has no org/project/session FK → only the global scope yields it.
				if (scope.type !== "global") return EMPTY_OUTCOME;

				const fl = buildFacetSearchSql({
					query,
					columns: [driveFiles.name],
				});
				const conds: SQL[] = [
					eq(driveFiles.userId, userId),
					isNull(driveFiles.trashedAt),
					eq(driveFiles.status, "clean"),
					fl.match,
				];

				const [cnt, rows] = await Promise.all([
					db
						.select({ value: count() })
						.from(driveFiles)
						.where(and(...conds)),
					db
						.select({
							id: driveFiles.id,
							title: driveFiles.name,
							snippet: fl.headline,
							score: fl.rank,
							updatedAt: driveFiles.updatedAt,
						})
						.from(driveFiles)
						.where(and(...conds))
						.orderBy(
							desc(fl.rank),
							desc(driveFiles.updatedAt),
							desc(driveFiles.id),
						)
						.limit(limit),
				]);

				return {
					results: rows.map((row) =>
						toResult(row, "file", "files", row.title ?? ""),
					),
					count: cnt[0]?.value ?? 0,
				};
			};

			const [titles, messages, toolCalls, files] = await Promise.all([
				titlesOutcome(),
				messagesOutcome(),
				toolCallsOutcome(),
				filesOutcome(),
			]);

			facetCounts.titles = titles.count;
			facetCounts.messages = messages.count;
			facetCounts.toolCalls = toolCalls.count;
			facetCounts.files = files.count;

			const results = [
				...titles.results,
				...messages.results,
				...toolCalls.results,
				...files.results,
			].sort((a, b) => b.score - a.score);

			return { results, facetCounts };
		}),
};

/** Shape of a raw facet row before it is tagged with kind/facet. */
interface RawRow {
	id: string;
	snippet: string | null;
	score: number;
	updatedAt: Date;
}

/** Map a raw facet row into the entity-agnostic `SearchResult`. */
function toResult(
	row: RawRow,
	kind: SearchEntityKind,
	facet: SearchFacet,
	title: string,
): SearchResult {
	return {
		id: row.id,
		kind,
		facet,
		title,
		snippet: row.snippet && row.snippet.length > 0 ? row.snippet : null,
		score: typeof row.score === "number" ? row.score : Number(row.score) || 0,
		updatedAt: row.updatedAt.toISOString(),
	};
}

/**
 * Chat messages have no title — derive a short display line from the content's
 * first non-empty line so the results list stays scannable. The full match is
 * still highlighted in the snippet.
 */
function deriveMessageTitle(content: string): string {
	const firstLine = content
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "Сообщение";
	return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}
