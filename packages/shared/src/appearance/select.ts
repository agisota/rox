/**
 * No-repeat selection helpers for quotes and wallpapers
 * (custom-loading-screens epic).
 *
 * Pure and RNG-injectable so callers (e.g. a wallpaper rotation store) stay
 * deterministic and testable. "No repeat" means the next pick never equals the
 * current one unless there is only a single candidate.
 */

/** A pick must be identifiable so we can avoid repeating the current one. */
export interface Identifiable {
	id: string;
}

/**
 * Pick the next index in `[0, length)` avoiding `currentIndex`.
 *
 * Returns -1 for an empty range, `currentIndex` (0) for a single item, and a
 * uniformly random other index otherwise. `random` returns a float in [0, 1).
 */
export function pickNextIndex(
	length: number,
	currentIndex: number,
	random: () => number = Math.random,
): number {
	if (length <= 0) return -1;
	if (length === 1) return 0;

	// An out-of-range current (e.g. -1 when not found) means "no exclusion":
	// every index is eligible.
	if (currentIndex < 0 || currentIndex >= length) {
		return Math.floor(random() * length);
	}

	// Choose among the (length - 1) indices that are not currentIndex, then map
	// back so each non-current index is equally likely.
	const offset = Math.floor(random() * (length - 1));
	return offset >= currentIndex ? offset + 1 : offset;
}

/**
 * Pick the next item from `items` avoiding the one matching `currentId`.
 *
 * Returns null for an empty list. If `currentId` is not found, all items are
 * eligible.
 */
export function pickNext<T extends Identifiable>(
	items: readonly T[],
	currentId: string | null,
	random: () => number = Math.random,
): T | null {
	if (items.length === 0) return null;

	// findIndex → -1 when not found; pickNextIndex treats an out-of-range index
	// as "no exclusion", so every item stays eligible.
	const currentIndex = items.findIndex((item) => item.id === currentId);
	const nextIndex = pickNextIndex(items.length, currentIndex, random);
	return items[nextIndex] ?? null;
}
