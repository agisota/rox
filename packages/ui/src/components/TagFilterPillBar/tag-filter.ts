/**
 * Pure derivation + serialisable tri-state filter for the tag pill-bar
 * (Hermes-borrow F10). No DOM, no React, no I/O — so the same `(labels, filter)`
 * derives byte-identical pills on web, desktop, and mobile, and the filter→query
 * mapping is unit-testable without a live tRPC client.
 *
 * Tags ⟂ identity: a label is the organization axis only (colour + name), never
 * the persona/org (who/where) axis.
 */

import { identityGlyph } from "@rox/shared/identity-glyph";

/** An org chat label as surfaced by `chatLabels.list` (the colour registry). */
export interface TagLabel {
	/** Stable label id (`chat_labels.id`). */
	id: string;
	/** Display name — also the membership key in `chat_sessions.labels`. */
	name: string;
	/** Ready-to-use CSS colour for the dot; falls back to the auto-colour. */
	color?: string | null;
}

/**
 * The serialisable tri-state list filter. `all` clears the filter, `unassigned`
 * keeps only sessions with no labels, `labels` keeps sessions matching ANY of
 * `names` (the `listSessions({ labelsAny })` axis). Plain data so it round-trips
 * through IPC / RN navigation params unchanged.
 */
export type TagFilterState =
	| { kind: "all" }
	| { kind: "unassigned" }
	| { kind: "labels"; names: string[] };

/** The default, unfiltered state. */
export const ALL_TAGS_FILTER: TagFilterState = { kind: "all" };

/** Resolve a label's dot colour, defaulting to the deterministic auto-colour. */
export function labelColor(label: TagLabel): string {
	return label.color ?? identityGlyph(label.name).background;
}

/** Whether `name` is currently part of an active `labels` filter. */
export function isLabelActive(filter: TagFilterState, name: string): boolean {
	return filter.kind === "labels" && filter.names.includes(name);
}

/**
 * Toggle a single label in the tri-state filter. Selecting a label from `all`
 * or `unassigned` starts a fresh `labels` set; toggling the last active label
 * off collapses back to `all`. Multi-select stays within the `labelsAny` axis.
 */
export function toggleLabel(
	filter: TagFilterState,
	name: string,
): TagFilterState {
	if (filter.kind !== "labels") {
		return { kind: "labels", names: [name] };
	}

	const names = filter.names.includes(name)
		? filter.names.filter((candidate) => candidate !== name)
		: [...filter.names, name];

	return names.length === 0 ? ALL_TAGS_FILTER : { kind: "labels", names };
}

/** A single derived pill descriptor consumed by the presentational bar. */
export interface TagPill {
	/** Stable React key / `data-pill` token. */
	key: string;
	/** Pill kind drives styling (accent fill, dashed border, colour dot). */
	kind: "all" | "unassigned" | "label";
	/** Visible label text. */
	label: string;
	/** Whether this pill matches the current filter (accent fill). */
	active: boolean;
	/** For `label` pills: the membership name and its dot colour. */
	name?: string;
	color?: string;
}

/**
 * Derive the ordered pill row from the distinct label registry and the current
 * filter: `All` first, then a dashed `Unassigned`, then one pill per label with
 * its colour dot. Exactly one of `All`/`Unassigned` is active, or one-or-more
 * `label` pills — mirroring the tri-state filter.
 */
export function deriveTagPills(
	labels: readonly TagLabel[],
	filter: TagFilterState,
): TagPill[] {
	const pills: TagPill[] = [
		{
			key: "all",
			kind: "all",
			label: "All",
			active: filter.kind === "all",
		},
		{
			key: "unassigned",
			kind: "unassigned",
			label: "Unassigned",
			active: filter.kind === "unassigned",
		},
	];

	for (const label of labels) {
		pills.push({
			key: `label:${label.id}`,
			kind: "label",
			label: label.name,
			active: isLabelActive(filter, label.name),
			name: label.name,
			color: labelColor(label),
		});
	}

	return pills;
}

/** The `chat.listSessions` label-filter input slice ({} when unfiltered). */
export interface TagListSessionsInput {
	labelsAny?: string[];
}

/**
 * Map the tri-state filter to the `listSessions` input. `all` and `unassigned`
 * add no `labelsAny` (the caller handles `unassigned` client-side by keeping
 * empty-label sessions), `labels` forwards the ANY axis. Returns a fresh object
 * so it spreads safely into a query key.
 */
export function tagFilterToListInput(
	filter: TagFilterState,
): TagListSessionsInput {
	if (filter.kind === "labels" && filter.names.length > 0) {
		return { labelsAny: [...filter.names] };
	}
	return {};
}

/**
 * Whether a session with `sessionLabels` passes the filter *client-side*. Used
 * for the `unassigned` axis (no server param) and as a cheap local refinement
 * for `labels`; `all` always passes.
 */
export function sessionPassesFilter(
	filter: TagFilterState,
	sessionLabels: readonly string[],
): boolean {
	switch (filter.kind) {
		case "all":
			return true;
		case "unassigned":
			return sessionLabels.length === 0;
		case "labels":
			return filter.names.some((name) => sessionLabels.includes(name));
	}
}
