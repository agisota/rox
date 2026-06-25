/**
 * Pure, serializable collapse-state for the time-grouped chat list
 * (Hermes-borrow F18). The set of *collapsed* group keys is the persisted
 * per-user pref; storing only the collapsed keys (not every key) keeps the
 * default — everything expanded — implicit and forward-compatible when new
 * group keys appear. No I/O here: a surface loads/saves the serialized form via
 * its own user-prefs store (desktop store, web/mobile API), this module only
 * derives the next state.
 */

import type { SessionAgeGroupKey } from "./group-sessions";

/** Group keys that can be collapsed. `★Pinned` (F19) is not collapsible. */
export type CollapsibleGroupKey = SessionAgeGroupKey;

/**
 * The persisted collapse pref: the keys the user has collapsed. Serializable
 * (a string array round-trips through JSON / user-prefs) so the same value
 * drives desktop/web/mobile identically. Absent ⇒ all groups expanded.
 */
export type GroupCollapseState = readonly CollapsibleGroupKey[];

/** Whether `key` is currently collapsed in `state`. */
export function isGroupCollapsed(
	state: GroupCollapseState | undefined,
	key: CollapsibleGroupKey,
): boolean {
	return state?.includes(key) ?? false;
}

/**
 * Toggle one group's collapsed state, returning the next persistable pref.
 * Order-insensitive and idempotent per direction; the result is de-duplicated
 * so repeated collapses can't bloat the stored array.
 */
export function toggleGroupCollapsed(
	state: GroupCollapseState | undefined,
	key: CollapsibleGroupKey,
): CollapsibleGroupKey[] {
	const current = new Set(state ?? []);
	if (current.has(key)) {
		current.delete(key);
	} else {
		current.add(key);
	}
	return [...current];
}

/**
 * Normalize an untrusted persisted value (e.g. a stale pref with keys that no
 * longer exist) into a clean `GroupCollapseState`. Drops unknown/duplicate keys
 * so a surface can hydrate straight from storage without guarding.
 */
export function normalizeCollapseState(
	raw: unknown,
	validKeys: readonly CollapsibleGroupKey[],
): CollapsibleGroupKey[] {
	if (!Array.isArray(raw)) return [];
	const allowed = new Set(validKeys);
	const seen = new Set<CollapsibleGroupKey>();
	const out: CollapsibleGroupKey[] = [];
	for (const value of raw) {
		if (typeof value !== "string") continue;
		const key = value as CollapsibleGroupKey;
		if (!allowed.has(key) || seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
}
