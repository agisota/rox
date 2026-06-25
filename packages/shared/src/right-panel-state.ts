/**
 * Right files panel — 3-state core (F03, Hermes-borrow #616).
 *
 * The single, platform-agnostic source of truth for the right-hand files panel
 * (favourite ④). The panel has three resting states rather than the old binary
 * open/closed:
 *
 *   - `hidden`   — width collapses to 0; a floating edge-pill is the only
 *                  affordance to bring it back (one click → `expanded`).
 *   - `peek`     — a narrow snap that previews the tree without committing the
 *                  full panel width.
 *   - `expanded` — the full panel.
 *
 * Desktop (lead), web, and mobile all consume THIS machine — there is no
 * per-platform copy of the state or its persistence, so "panel state on desktop
 * = panel state on phone" stays true the same way the F56 zen-mode core makes
 * the shell collapse portable. Web renders the same state as a docked panel;
 * mobile renders it as a slide-over. The motion (240ms glide / edge-pill) lives
 * at the call site, driven by `@rox/ui/motion` tokens and gated on the motion
 * governor (`useShouldAnimate`) so reduced-motion hosts snap instantly.
 *
 * Why it lives in `@rox/shared` (and stays React-free): the store exposes a
 * `useSyncExternalStore`-compatible `subscribe`/`getSnapshot` pair (mirroring
 * the F56 zen-mode store) so every React host drives re-renders without the
 * core depending on React, the DOM, or zustand. The only escape hatch is an
 * injectable {@link RightPanelStorage} — `localStorage` on web/desktop, an
 * `AsyncStorage`-shaped adapter on mobile — keeping the persisted value plain
 * serializable JSON (`{ state }`).
 */

/** The three resting states of the right files panel. */
export type RightPanelState = "hidden" | "peek" | "expanded";

/** Ordered tuple of every valid state — handy for validation and tests. */
export const RIGHT_PANEL_STATES: readonly RightPanelState[] = [
	"hidden",
	"peek",
	"expanded",
] as const;

/** Serializable persisted shape. Plain JSON so it round-trips every store. */
export interface RightPanelSnapshot {
	/** Current resting state of the panel. */
	state: RightPanelState;
}

/**
 * Minimal synchronous key/value surface the store persists through. Both
 * `localStorage` (web/desktop) and a thin wrapper over mobile storage satisfy
 * it. Optional — omit it and the store is purely in-memory.
 */
export interface RightPanelStorage {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
}

/** A right-panel store. Instance-based so each host (and each test) owns one. */
export interface RightPanelStore {
	/** Current snapshot. Stable identity until the value actually changes. */
	getSnapshot: () => RightPanelSnapshot;
	/** Subscribe to changes; returns an unsubscribe. `useSyncExternalStore`-ready. */
	subscribe: (listener: () => void) => () => void;
	/** Force a specific state (idempotent). */
	setState: (state: RightPanelState) => void;
	/** Collapse to `hidden` (idempotent). */
	hide: () => void;
	/** Snap to the narrow `peek` state (idempotent). */
	peek: () => void;
	/** Open the full panel (idempotent). The edge-pill reopen target. */
	expand: () => void;
	/**
	 * Cycle to the next state in a stable order: `hidden → peek → expanded →
	 * hidden`. Mirrors the binary toggle of the old machine but across 3 states.
	 */
	cycle: () => void;
}

/** Default persistence key. Shared so every host reads/writes the same slot. */
export const RIGHT_PANEL_STORAGE_KEY = "rox.right-panel-state";

export interface CreateRightPanelStoreOptions {
	/** Persistence backend. Omit for in-memory only (e.g. SSR, tests). */
	storage?: RightPanelStorage;
	/** Storage key override (defaults to {@link RIGHT_PANEL_STORAGE_KEY}). */
	storageKey?: string;
	/** Initial state when nothing is persisted yet. Defaults to `expanded`. */
	initialState?: RightPanelState;
}

/** Narrow an unknown value to a {@link RightPanelState}, else `null`. */
export function parseRightPanelState(value: unknown): RightPanelState | null {
	return value === "hidden" || value === "peek" || value === "expanded"
		? value
		: null;
}

/**
 * Bridge from the legacy binary `rightSidebarOpen` flag to the 3-state machine:
 * an open panel becomes `expanded`, a closed one becomes `hidden`. Hosts use
 * this once when healing a row persisted before the `state` column existed.
 */
export function rightPanelStateFromLegacyOpen(open: boolean): RightPanelState {
	return open ? "expanded" : "hidden";
}

/** The next state in the `hidden → peek → expanded → hidden` cycle. */
function nextCycleState(state: RightPanelState): RightPanelState {
	switch (state) {
		case "hidden":
			return "peek";
		case "peek":
			return "expanded";
		case "expanded":
			return "hidden";
	}
}

function readPersisted(
	storage: RightPanelStorage | undefined,
	key: string,
	fallback: RightPanelState,
): RightPanelState {
	if (!storage) return fallback;
	try {
		const raw = storage.getItem(key);
		if (raw == null) return fallback;
		const parsed = JSON.parse(raw) as Partial<RightPanelSnapshot> | null;
		return parseRightPanelState(parsed?.state) ?? fallback;
	} catch {
		// Corrupt/inaccessible storage must never break the shell — fall back.
		return fallback;
	}
}

function writePersisted(
	storage: RightPanelStorage | undefined,
	key: string,
	snapshot: RightPanelSnapshot,
): void {
	if (!storage) return;
	try {
		storage.setItem(key, JSON.stringify(snapshot));
	} catch {
		// Best-effort: a write failure (quota, private mode) is non-fatal.
	}
}

export function createRightPanelStore(
	options: CreateRightPanelStoreOptions = {},
): RightPanelStore {
	const {
		storage,
		storageKey = RIGHT_PANEL_STORAGE_KEY,
		initialState = "expanded",
	} = options;

	const listeners = new Set<() => void>();
	let snapshot: RightPanelSnapshot = {
		state: readPersisted(storage, storageKey, initialState),
	};

	function commit(state: RightPanelState): void {
		if (state === snapshot.state) return;
		// New object identity only on real change so `useSyncExternalStore`
		// callers don't tear or loop on a stable value.
		snapshot = { state };
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
		setState(state) {
			commit(state);
		},
		hide() {
			commit("hidden");
		},
		peek() {
			commit("peek");
		},
		expand() {
			commit("expanded");
		},
		cycle() {
			commit(nextCycleState(snapshot.state));
		},
	};
}
