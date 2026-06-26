/**
 * Focus / Zen mode — shared core (F56, Hermes-borrow #649).
 *
 * The single, platform-agnostic source of truth for the shell-level "zen"
 * chrome-collapse mode: one toggle collapses the sidebar + file tree, expands
 * the canvas, and dims the surrounding chrome. Desktop (lead), web, and mobile
 * all consume THIS store — there is no per-platform copy of the on/off state or
 * its persistence, so "zen on desktop = zen on phone" stays true the same way
 * the F46 prefs core makes pins portable.
 *
 * Why it lives in `@rox/shared` (and stays React-free): the store exposes a
 * `useSyncExternalStore`-compatible `subscribe`/`getSnapshot` pair (mirroring
 * the F44 command-palette registry) so every React host drives re-renders
 * without the core depending on React, the DOM, or zustand. The only escape
 * hatch is an injectable {@link ZenModeStorage} — `localStorage` on web/desktop,
 * an `AsyncStorage`-shaped adapter on mobile — keeping the persisted value plain
 * serializable JSON (`{ active: boolean }`).
 *
 * This is distinct from the diff-view `useFocusMode` (which focuses a single
 * changed entry inside the changes pane); that hook is intentionally left
 * untouched. Zen mode operates one level up, on the 3-pane shell itself.
 */

/** Serializable persisted shape. Plain JSON so it round-trips every store. */
export interface ZenModeSnapshot {
	/** Whether the shell is currently collapsed into zen mode. */
	active: boolean;
}

/**
 * Minimal synchronous key/value surface the store persists through. Both
 * `localStorage` (web/desktop) and a thin wrapper over mobile storage satisfy
 * it. Optional — omit it and the store is purely in-memory.
 */
export interface ZenModeStorage {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
}

/** A zen-mode store. Instance-based so each host (and each test) owns one. */
export interface ZenModeStore {
	/** Current snapshot. Stable identity until the value actually changes. */
	getSnapshot: () => ZenModeSnapshot;
	/** Subscribe to changes; returns an unsubscribe. `useSyncExternalStore`-ready. */
	subscribe: (listener: () => void) => () => void;
	/** Enter zen mode (idempotent). */
	enter: () => void;
	/** Exit zen mode (idempotent). */
	exit: () => void;
	/** Flip the mode. */
	toggle: () => void;
	/** Force a specific value. */
	setActive: (active: boolean) => void;
}

/** Default persistence key. Shared so every host reads/writes the same slot. */
export const ZEN_MODE_STORAGE_KEY = "rox.zen-mode";

export interface CreateZenModeStoreOptions {
	/** Persistence backend. Omit for in-memory only (e.g. SSR, tests). */
	storage?: ZenModeStorage;
	/** Storage key override (defaults to {@link ZEN_MODE_STORAGE_KEY}). */
	storageKey?: string;
	/** Initial value when nothing is persisted yet. Defaults to `false`. */
	initialActive?: boolean;
}

function readPersisted(
	storage: ZenModeStorage | undefined,
	key: string,
	fallback: boolean,
): boolean {
	if (!storage) return fallback;
	try {
		const raw = storage.getItem(key);
		if (raw == null) return fallback;
		const parsed = JSON.parse(raw) as Partial<ZenModeSnapshot> | null;
		return typeof parsed?.active === "boolean" ? parsed.active : fallback;
	} catch {
		// Corrupt/inaccessible storage must never break the shell — fall back.
		return fallback;
	}
}

function writePersisted(
	storage: ZenModeStorage | undefined,
	key: string,
	snapshot: ZenModeSnapshot,
): void {
	if (!storage) return;
	try {
		storage.setItem(key, JSON.stringify(snapshot));
	} catch {
		// Best-effort: a write failure (quota, private mode) is non-fatal.
	}
}

export function createZenModeStore(
	options: CreateZenModeStoreOptions = {},
): ZenModeStore {
	const {
		storage,
		storageKey = ZEN_MODE_STORAGE_KEY,
		initialActive = false,
	} = options;

	const listeners = new Set<() => void>();
	let snapshot: ZenModeSnapshot = {
		active: readPersisted(storage, storageKey, initialActive),
	};

	function commit(active: boolean): void {
		if (active === snapshot.active) return;
		// New object identity only on real change so `useSyncExternalStore`
		// callers don't tear or loop on a stable value.
		snapshot = { active };
		writePersisted(storage, storageKey, snapshot);
		for (const listener of listeners) listener();
	}

	return {
		getSnapshot() {
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		enter() {
			commit(true);
		},
		exit() {
			commit(false);
		},
		toggle() {
			commit(!snapshot.active);
		},
		setActive(active) {
			commit(active);
		},
	};
}
