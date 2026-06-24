import { PROTOCOL_SCHEMES } from "./constants";

/**
 * Pure presentation + navigation helpers for the unified-search surface, shared
 * cross-platform (web + desktop). Maps a `graph.search` hit to a view model (RU
 * kind label, snippet, and a deep link to open the object) so each platform's
 * panel stays a thin render layer and the mapping is unit-tested once here.
 *
 * Dependency-free: no React, no tRPC, and intentionally no `@rox/db` import so
 * `@rox/shared` stays db-free (same inline-mirror rule as `rox-ledger-kind.ts`;
 * `@rox/db` depends on `@rox/shared`, so the reverse edge would be a cycle). The
 * entity kind is therefore typed as a plain string here; the consuming layers
 * (`apps/web`, `apps/desktop`) pass real `EntityKind` values, which structurally
 * satisfy `string`, and unknown kinds degrade to the raw kind label.
 */

/** A graph-object kind, mirrored as a string to keep `@rox/shared` db-free. */
export type UnifiedSearchEntityKind = string;

/** The slice of a `graph.search` hit this surface renders. */
export interface UnifiedSearchHit {
	id: string;
	kind: UnifiedSearchEntityKind;
	slug: string | null;
	title: string;
	status: "active" | "archived" | "trashed";
	score?: number;
	snippet?: string;
}

/** A presentational row derived from a hit. */
export interface UnifiedSearchResultViewModel {
	id: string;
	kind: UnifiedSearchEntityKind;
	kindLabel: string;
	title: string;
	snippet: string | null;
	/**
	 * `rox://…` deep link that opens the object in the Rox desktop app, or null
	 * when the hit has no slug (cannot be addressed) or its kind has no openable
	 * route yet. A null href renders the row as non-navigable rather than a dead
	 * link. (Web uses this as an `<a href>`; desktop, already in-app, opens the
	 * object in place but still relies on this to know whether a hit is openable.)
	 */
	href: string | null;
}

/** RU labels for the entity kinds the unified search can surface. */
const KIND_LABELS: Record<string, string> = {
	note: "Заметка",
	task: "Задача",
	project: "Проект",
	contact: "Контакт",
	feed: "Лента",
	file: "Файл",
	email: "Письмо",
	message: "Сообщение",
	channel: "Канал",
	calendar_event: "Событие",
	agent_session: "Сессия агента",
	journal: "Журнал",
	area: "Область",
	design_artifact: "Дизайн",
};

/**
 * The renderer route segment a kind opens to via `rox://<segment>/<slug>`. Only
 * kinds with a real desktop route are mapped; everything else returns null and
 * the row is shown without a deep link (honest: we do not fabricate routes that
 * 404). `task` mirrors the shipped `rox://tasks/<slug>` deep link
 * (`apps/web/src/app/tasks/[slug]/page.tsx`).
 */
const KIND_DEEPLINK_SEGMENT: Record<string, string> = {
	task: "tasks",
	note: "notes",
};

export function unifiedSearchKindLabel(kind: UnifiedSearchEntityKind): string {
	return KIND_LABELS[kind] ?? kind;
}

/**
 * Build the `rox://` deep link for a hit, or null when it cannot be opened
 * (missing slug, or a kind without an openable route). The slug is URL-encoded
 * so unusual characters survive the protocol URL.
 */
export function unifiedSearchHref(hit: UnifiedSearchHit): string | null {
	const segment = KIND_DEEPLINK_SEGMENT[hit.kind];
	if (!segment || !hit.slug) {
		return null;
	}
	return `${PROTOCOL_SCHEMES.PROD}://${segment}/${encodeURIComponent(hit.slug)}`;
}

/** Map a single hit to its presentational row. */
export function toUnifiedSearchResult(
	hit: UnifiedSearchHit,
): UnifiedSearchResultViewModel {
	const snippet = hit.snippet?.trim();
	return {
		id: hit.id,
		kind: hit.kind,
		kindLabel: unifiedSearchKindLabel(hit.kind),
		title: hit.title,
		snippet: snippet && snippet.length > 0 ? snippet : null,
		href: unifiedSearchHref(hit),
	};
}

/** Map a list of hits to presentational rows (order preserved). */
export function mapUnifiedSearchResults(
	hits: readonly UnifiedSearchHit[],
): UnifiedSearchResultViewModel[] {
	return hits.map(toUnifiedSearchResult);
}

/**
 * The kinds the unified search queries by default — the user-facing Project-OS
 * object kinds (note/task/project/contact/feed/file). Passed as `kinds[]` to
 * `graph.search` so the result set is scoped to addressable objects rather than
 * internal kinds (e.g. `activity_event`, `tag`).
 */
export const UNIFIED_SEARCH_DEFAULT_KINDS = [
	"note",
	"task",
	"project",
	"contact",
	"feed",
	"file",
] as const;
