"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs` — updates are coalesced so a fast typer
 * triggers at most one downstream effect per quiet window. Used to debounce the
 * unified-search query input so each keystroke does not fire a `graph.search`
 * call. A pending timer is cleared on change/unmount (no stale late update).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}
