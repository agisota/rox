/**
 * Pure derivation for the AI-suggested label ghost-chips (Hermes-borrow F14).
 * No DOM, no React, no I/O — so the dedupe/reconcile/dismiss logic derives the
 * same visible chip set on web, desktop, and mobile and is unit-testable without
 * a renderer (mirrors `TagFilterPillBar/tag-filter.ts`).
 *
 * Tags ⟂ identity: a suggested label is the organization axis only (a short
 * topic), never the persona/org (who/where) axis.
 */

import { identityGlyph } from "@rox/shared/identity-glyph";

/** Max chips shown at once — matches the server suggestion budget. */
export const MAX_SUGGESTED_CHIPS = 3;

/** Resolve a suggested chip's dot colour (the deterministic auto-colour). */
export function suggestedLabelColor(name: string): string {
	return identityGlyph(name).background;
}

/**
 * Derive the visible ghost-chips from the server suggestions, the labels already
 * on the session (manual override — never re-show an applied tag), and the set
 * the user has dismissed this session. Order-preserving, case-insensitive dedupe,
 * capped to {@link MAX_SUGGESTED_CHIPS}.
 *
 * Returning a plain `string[]` (not React nodes) keeps this driveable from the
 * same core on every platform — the renderer owns the chip chrome.
 */
export function deriveSuggestedChips(params: {
	/** Raw suggestions from `chat.generateLabelsFromTranscript`. */
	suggestions: readonly string[];
	/** Labels already applied to the session (`chat_sessions.labels`). */
	appliedLabels: readonly string[];
	/** Names the user dismissed this session (ghost-chip `×`). */
	dismissed: readonly string[];
}): string[] {
	const applied = new Set(
		params.appliedLabels.map((name) => name.trim().toLowerCase()),
	);
	const dismissed = new Set(
		params.dismissed.map((name) => name.trim().toLowerCase()),
	);

	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of params.suggestions) {
		const name = raw.trim();
		if (!name) {
			continue;
		}
		const key = name.toLowerCase();
		if (seen.has(key) || applied.has(key) || dismissed.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(name);
		if (out.length >= MAX_SUGGESTED_CHIPS) {
			break;
		}
	}
	return out;
}
