import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search box). Returns the latest value
 * only after `delayMs` of quiet. Used for the inbox search at 280 ms — the same
 * timing as the server FTS debounce in Notes — so the client filter does not
 * re-run on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(id);
	}, [value, delayMs]);
	return debounced;
}
