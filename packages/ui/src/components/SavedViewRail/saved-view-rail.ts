/**
 * Pure derivation + serialisable boolean tag-chip state for the chat Saved-View
 * rail (Hermes-borrow F17). No DOM, no React, no I/O — so the same inputs derive
 * byte-identical chips, sections, and live counts on web, desktop, and mobile,
 * and the chip→rule→query mapping is unit-testable without a live tRPC client.
 *
 * The rail composes three sections, mirroring the `DashboardSidebar` section
 * model (Smart Folders · Saved Views · the live boolean tag chips). The boolean
 * filter itself is the shared, serialisable `SavedViewRule`
 * (`@rox/shared/chat-saved-view`) — authored once and round-trippable through
 * IPC / RN nav params unchanged.
 *
 * Tags ⟂ identity: the label chips are the organization axis only, never the
 * persona/org (who/where) axis.
 */

import {
	type SavedViewRule,
	SMART_FOLDERS,
	type SmartFolder,
	sessionMatchesRule,
} from "@rox/shared/chat-saved-view";
import { identityGlyph } from "@rox/shared/identity-glyph";

/** An org chat label as surfaced by `chatLabels.list` (the colour registry). */
export interface RailLabel {
	/** Stable label id (`chat_labels.id`). */
	id: string;
	/** Display name — also the membership key in `chat_sessions.labels`. */
	name: string;
	/** Ready-to-use CSS colour for the dot; falls back to the auto-colour. */
	color?: string | null;
}

/** A persisted Saved View as surfaced by `chatSavedViews.list`. */
export interface RailSavedView {
	/** Stable view id (`chat_saved_views.id`). */
	id: string;
	/** Display name. */
	name: string;
	/** The serialisable boolean tag-filter expression. */
	rule: SavedViewRule;
	/** Optional CSS colour for the view chip. */
	color?: string | null;
}

/**
 * The per-label boolean chip mode. `off` excludes the label from the filter;
 * `any`/`all`/`none` place it on the OR/AND/NOT axis. A chip cycles
 * off → any → all → none → off (see {@link cycleChipMode}). Plain data so the
 * whole map round-trips through IPC / RN nav params unchanged.
 */
export type ChipMode = "off" | "any" | "all" | "none";

/** The serialisable boolean-chip selection: label name → its axis mode. */
export type ChipSelection = Record<string, ChipMode>;

/** The empty selection — no chip active (an unfiltered rail). */
export const EMPTY_CHIP_SELECTION: ChipSelection = {};

/** Resolve a label's dot colour, defaulting to the deterministic auto-colour. */
export function railLabelColor(label: RailLabel): string {
	return label.color ?? identityGlyph(label.name).background;
}

/** The mode for a label name in the selection (`off` when absent). */
export function chipMode(selection: ChipSelection, name: string): ChipMode {
	return selection[name] ?? "off";
}

/** Order the chip cycles through on click. */
const CHIP_CYCLE: readonly ChipMode[] = ["off", "any", "all", "none"];

/** Advance a chip to its next axis mode (wraps `none` → `off`). */
export function cycleChipMode(mode: ChipMode): ChipMode {
	const index = CHIP_CYCLE.indexOf(mode);
	// `index` is always a valid position (mode is a ChipMode) and the modulo keeps
	// the result in-bounds, so the lookup is never `undefined` — assert for the
	// `noUncheckedIndexedAccess` checker.
	return CHIP_CYCLE[(index + 1) % CHIP_CYCLE.length] as ChipMode;
}

/**
 * Toggle a label's chip to its next axis mode in the selection. Cycling a chip
 * back to `off` removes the key so an unfiltered rail serialises to `{}`.
 */
export function toggleChip(
	selection: ChipSelection,
	name: string,
): ChipSelection {
	const next = cycleChipMode(chipMode(selection, name));
	const updated = { ...selection };
	if (next === "off") {
		delete updated[name];
	} else {
		updated[name] = next;
	}
	return updated;
}

/**
 * Reduce the boolean-chip selection to a serialisable {@link SavedViewRule}.
 * Each axis collects the names assigned to it; empty axes are omitted, so an
 * all-`off` selection yields the empty rule (the unfiltered query).
 */
export function chipSelectionToRule(selection: ChipSelection): SavedViewRule {
	const any: string[] = [];
	const all: string[] = [];
	const none: string[] = [];
	for (const [name, mode] of Object.entries(selection)) {
		if (mode === "any") {
			any.push(name);
		} else if (mode === "all") {
			all.push(name);
		} else if (mode === "none") {
			none.push(name);
		}
	}
	const rule: SavedViewRule = {};
	if (all.length > 0) {
		rule.labelsAll = all;
	}
	if (any.length > 0) {
		rule.labelsAny = any;
	}
	if (none.length > 0) {
		rule.labelsNone = none;
	}
	return rule;
}

/**
 * Recover a boolean-chip selection from a persisted rule (applying a Saved View
 * back onto the rail). The inverse of {@link chipSelectionToRule} for the label
 * axes; the `untagged`/`status` facets carry no chip and are ignored here.
 */
export function ruleToChipSelection(rule: SavedViewRule): ChipSelection {
	const selection: ChipSelection = {};
	for (const name of rule.labelsAll ?? []) {
		selection[name] = "all";
	}
	for (const name of rule.labelsAny ?? []) {
		selection[name] = "any";
	}
	for (const name of rule.labelsNone ?? []) {
		selection[name] = "none";
	}
	return selection;
}

/** A single derived label chip consumed by the presentational rail. */
export interface RailChip {
	/** Stable React key / `data-chip` token. */
	key: string;
	/** The label membership name. */
	name: string;
	/** Resolved dot colour. */
	color: string;
	/** Current axis mode (drives the chip glyph + accent). */
	mode: ChipMode;
}

/** Derive the ordered chip row from the label registry + current selection. */
export function deriveRailChips(
	labels: readonly RailLabel[],
	selection: ChipSelection,
): RailChip[] {
	return labels.map((label) => ({
		key: `chip:${label.id}`,
		name: label.name,
		color: railLabelColor(label),
		mode: chipMode(selection, label.name),
	}));
}

/** A minimal session shape the rail counts/filters over (client-side). */
export interface RailSession {
	labels: readonly string[];
	status?: "active" | "archived";
}

/**
 * Live count of sessions a rule keeps, evaluated client-side over the already
 * loaded session list (the rail's live counter). Pure refinement via the shared
 * `sessionMatchesRule`, so the counter and the server query agree on semantics.
 */
export function countMatchingSessions(
	rule: SavedViewRule,
	sessions: readonly RailSession[],
): number {
	let count = 0;
	for (const session of sessions) {
		if (sessionMatchesRule(rule, session)) {
			count += 1;
		}
	}
	return count;
}

/** A Smart Folder row with its live count, ready for the rail. */
export interface RailSmartFolder extends SmartFolder {
	/** Live count of matching sessions (client-side). */
	count: number;
}

/**
 * Derive the Smart-Folder section with live counts. Server-complete folders
 * ("Untagged") count via their rule; client-only folders carry an empty rule
 * here and their count is left to the surface that owns the per-session
 * metadata (defaults to the rule match, i.e. the full list, until refined).
 */
export function deriveSmartFolders(
	sessions: readonly RailSession[],
): RailSmartFolder[] {
	return SMART_FOLDERS.map((folder) => ({
		...folder,
		count: folder.serverComplete
			? countMatchingSessions(folder.rule, sessions)
			: 0,
	}));
}

export type {
	SavedViewRule,
	SmartFolder,
	SmartFolderId,
} from "@rox/shared/chat-saved-view";
export { SMART_FOLDERS } from "@rox/shared/chat-saved-view";
