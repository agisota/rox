/**
 * Graph core (#01) — backlink/edge resolver on `edges` (spec §3.1).
 *
 * Ported from `router/knowledge/backlinks.ts` but operating on `edges` instead
 * of `knowledge_links`. On every write we re-parse the source node's
 * `[[wikilinks]]` + `#tags` and replace its outgoing `links_to`/`tagged_with`
 * edges (delete + insert). Slug resolution is NOT hardcoded to kind=note: the
 * natural key is `(org, kind, slug)`, so one slug may live across several
 * linkable kinds. The picker is deterministic (kind priority, then oldest), and
 * ambiguous matches carry `metadata.ambiguous` for UI disambiguation.
 *
 * `tagged_with` lazily creates a `tag` node (kind=tag, slug=normalized tag) and
 * links to it. `resolveIncomingLinks` back-fills previously-unresolved edges
 * once a node with the matching slug appears.
 */

import { edges, entities } from "@rox/db/schema";
import { extractTags, extractWikiLinkTargets } from "@rox/shared/knowledge";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { GraphTx } from "./types";

/** Linkable kinds a `[[wikilink]]` slug may resolve to, in priority order. */
const LINKABLE_KIND_PRIORITY = [
	"note",
	"contact",
	"tag",
	"project",
	"area",
] as const;

type LinkableKind = (typeof LINKABLE_KIND_PRIORITY)[number];

interface ResolvedTarget {
	targetEntityId: string | null;
	metadata: Record<string, unknown>;
}

/**
 * Replace the outgoing `links_to` + `tagged_with` edges for a source node based
 * on the wikilinks and tags found in `markdown`.
 */
export async function syncOutgoingLinks(
	tx: GraphTx,
	params: {
		organizationId: string;
		sourceEntityId: string;
		markdown: string | null | undefined;
	},
): Promise<void> {
	const { organizationId, sourceEntityId } = params;
	const source = params.markdown ?? "";
	const linkTargets = extractWikiLinkTargets(source);
	const tagTargets = extractTags(source);

	// Drop existing outgoing wikilink/tag edges for this node (full rewrite).
	await tx
		.delete(edges)
		.where(
			and(
				eq(edges.organizationId, organizationId),
				eq(edges.sourceEntityId, sourceEntityId),
				inArray(edges.relation, ["links_to", "tagged_with"]),
			),
		);

	// --- links_to -----------------------------------------------------------
	if (linkTargets.length > 0) {
		const candidates = await tx
			.select({
				id: entities.id,
				kind: entities.kind,
				slug: entities.slug,
			})
			.from(entities)
			.where(
				and(
					eq(entities.organizationId, organizationId),
					eq(entities.status, "active"),
					inArray(entities.slug, linkTargets),
				),
			);

		const bySlug = new Map<string, Array<{ id: string; kind: string }>>();
		for (const c of candidates) {
			if (!c.slug) continue;
			const list = bySlug.get(c.slug) ?? [];
			list.push({ id: c.id, kind: c.kind });
			bySlug.set(c.slug, list);
		}

		await tx.insert(edges).values(
			linkTargets.map((targetSlug) => {
				const resolved = pickLinkTarget(bySlug.get(targetSlug));
				return {
					organizationId,
					sourceEntityId,
					targetEntityId: resolved.targetEntityId,
					targetSlug,
					resolved: resolved.targetEntityId !== null,
					relation: "links_to" as const,
					metadata: resolved.metadata,
				};
			}),
		);
	}

	// --- tagged_with (lazy-create tag node) ---------------------------------
	if (tagTargets.length > 0) {
		const tagEntityBySlug = await ensureTagNodes(
			tx,
			organizationId,
			tagTargets,
		);
		await tx.insert(edges).values(
			tagTargets.map((slug) => ({
				organizationId,
				sourceEntityId,
				targetEntityId: tagEntityBySlug.get(slug) ?? null,
				targetSlug: slug,
				resolved: tagEntityBySlug.has(slug),
				relation: "tagged_with" as const,
				metadata: {},
			})),
		);
	}
}

/**
 * Back-fill previously-unresolved edges that now point at a node with `slug`
 * (called after a node is created/renamed so existing references light up).
 */
export async function resolveIncomingLinks(
	tx: GraphTx,
	params: { organizationId: string; entityId: string; slug: string },
): Promise<number> {
	const updated = await tx
		.update(edges)
		.set({ targetEntityId: params.entityId, resolved: true })
		.where(
			and(
				eq(edges.organizationId, params.organizationId),
				eq(edges.targetSlug, params.slug),
				isNull(edges.targetEntityId),
			),
		)
		.returning({ id: edges.id });
	return updated.length;
}

// --- helpers ---------------------------------------------------------------

/**
 * Deterministically choose the resolved target among slug candidates:
 *   0 → unresolved; 1 → that node; >1 → highest-priority kind (flag
 *   `ambiguous` with candidate kinds for the UI).
 */
function pickLinkTarget(
	candidates: Array<{ id: string; kind: string }> | undefined,
): ResolvedTarget {
	if (!candidates || candidates.length === 0) {
		return { targetEntityId: null, metadata: {} };
	}
	if (candidates.length === 1) {
		const only = candidates[0];
		return only
			? { targetEntityId: only.id, metadata: {} }
			: { targetEntityId: null, metadata: {} };
	}

	let best = candidates[0];
	let bestRank = kindRank(best?.kind);
	for (const c of candidates) {
		const rank = kindRank(c.kind);
		if (rank < bestRank) {
			best = c;
			bestRank = rank;
		}
	}
	return {
		targetEntityId: best?.id ?? null,
		metadata: {
			ambiguous: true,
			candidateKinds: candidates.map((c) => c.kind),
		},
	};
}

function kindRank(kind: string | undefined): number {
	const idx = LINKABLE_KIND_PRIORITY.indexOf(kind as LinkableKind);
	return idx === -1 ? LINKABLE_KIND_PRIORITY.length : idx;
}

/**
 * Find-or-create `tag` nodes for the given tag slugs; returns slug → entityId.
 * Uses the `(org, kind, slug)` natural key with `onConflictDoNothing` so
 * concurrent writers converge on a single tag node.
 */
async function ensureTagNodes(
	tx: GraphTx,
	organizationId: string,
	tagSlugs: string[],
): Promise<Map<string, string>> {
	const existing = await tx
		.select({ id: entities.id, slug: entities.slug })
		.from(entities)
		.where(
			and(
				eq(entities.organizationId, organizationId),
				eq(entities.kind, "tag"),
				inArray(entities.slug, tagSlugs),
			),
		);
	const bySlug = new Map<string, string>();
	for (const e of existing) if (e.slug) bySlug.set(e.slug, e.id);

	const missing = tagSlugs.filter((s) => !bySlug.has(s));
	if (missing.length > 0) {
		const inserted = await tx
			.insert(entities)
			.values(
				missing.map((slug) => ({
					organizationId,
					kind: "tag" as const,
					slug,
					title: slug,
				})),
			)
			.onConflictDoNothing({
				target: [entities.organizationId, entities.kind, entities.slug],
			})
			.returning({ id: entities.id, slug: entities.slug });
		for (const e of inserted) if (e.slug) bySlug.set(e.slug, e.id);

		// Any still-missing slug lost an insert race — re-read it.
		const stillMissing = missing.filter((s) => !bySlug.has(s));
		if (stillMissing.length > 0) {
			const reread = await tx
				.select({ id: entities.id, slug: entities.slug })
				.from(entities)
				.where(
					and(
						eq(entities.organizationId, organizationId),
						eq(entities.kind, "tag"),
						inArray(entities.slug, stillMissing),
					),
				);
			for (const e of reread) if (e.slug) bySlug.set(e.slug, e.id);
		}
	}

	return bySlug;
}
