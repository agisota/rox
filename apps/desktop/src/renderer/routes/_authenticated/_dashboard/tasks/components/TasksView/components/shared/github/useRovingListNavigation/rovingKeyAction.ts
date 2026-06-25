export type RovingKeyAction =
	| { type: "move"; index: number }
	| { type: "activate"; index: number }
	| { type: "none" };

/**
 * Pure key → action mapper shared by the hook and unit tests. Keeps the
 * j/k/Enter/Home/End semantics in one dependency-free place; the result index
 * is always clamped to `[0, itemCount-1]`. Lives in its own module (no React
 * import) so it can be unit-tested without a DOM/React runtime.
 */
export function rovingKeyAction(
	key: string,
	activeIndex: number,
	itemCount: number,
): RovingKeyAction {
	if (itemCount === 0) return { type: "none" };
	const clamp = (n: number) => Math.max(0, Math.min(itemCount - 1, n));
	const current = activeIndex < 0 ? 0 : activeIndex;
	switch (key) {
		case "j":
		case "ArrowDown":
			return { type: "move", index: clamp(activeIndex < 0 ? 0 : current + 1) };
		case "k":
		case "ArrowUp":
			return { type: "move", index: clamp(activeIndex < 0 ? 0 : current - 1) };
		case "Home":
			return { type: "move", index: 0 };
		case "End":
			return { type: "move", index: itemCount - 1 };
		case "Enter":
			return activeIndex >= 0
				? { type: "activate", index: activeIndex }
				: { type: "none" };
		default:
			return { type: "none" };
	}
}
