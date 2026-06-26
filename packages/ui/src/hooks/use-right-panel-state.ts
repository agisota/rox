import {
	createRightPanelStore,
	type RightPanelSnapshot,
	type RightPanelState,
	type RightPanelStorage,
	type RightPanelStore,
} from "@rox/shared/right-panel-state";
import { useSyncExternalStore } from "react";

/**
 * Right files panel — React binding (F03, Hermes-borrow #616).
 *
 * Thin React adapter over the platform-neutral `@rox/shared/right-panel-state`
 * machine. The store holds the panel's resting state (`hidden`/`peek`/
 * `expanded`); this hook subscribes a host (desktop lead, web, mobile) to it via
 * `useSyncExternalStore` and returns the state plus the `hide`/`peek`/`expand`/
 * `cycle` controls and a few derived booleans the chrome reads directly. The
 * 240ms glide + floating edge-pill live at the call site, driven by
 * `@rox/ui/motion` tokens and gated on `useShouldAnimate` so reduced-motion
 * hosts snap instantly.
 *
 * Mirrors the F56 `useZenMode` binding: hosts that need an isolated or
 * differently-persisted store (mobile, tests, or the desktop prefs-backed
 * store) pass one in via {@link UseRightPanelStateOptions.store}; the default
 * process-wide store persists through `localStorage` for plain DOM hosts.
 */

/**
 * Browser/desktop-friendly persistence over `localStorage`, guarded for SSR and
 * private-mode access errors. Mobile passes its own `AsyncStorage`-shaped
 * adapter instead (see {@link useRightPanelState} options).
 */
function getWebStorage(): RightPanelStorage | undefined {
	if (typeof window === "undefined" || !window.localStorage) return undefined;
	return {
		getItem: (key) => window.localStorage.getItem(key),
		setItem: (key, value) => window.localStorage.setItem(key, value),
	};
}

/**
 * The default process-wide store for DOM hosts (web). Created lazily so a server
 * render never touches `window`. Hosts that persist through their own prefs
 * (desktop) or storage (mobile, tests) pass one in via the hook options.
 */
let defaultStore: RightPanelStore | undefined;
function getDefaultStore(): RightPanelStore {
	if (!defaultStore) {
		defaultStore = createRightPanelStore({ storage: getWebStorage() });
	}
	return defaultStore;
}

export interface UseRightPanelStateResult {
	/** Current resting state of the panel. */
	state: RightPanelState;
	/** `true` while the panel is collapsed — the edge-pill is the only reopen. */
	isHidden: boolean;
	/** `true` while the panel is in its narrow peek snap. */
	isPeek: boolean;
	/** `true` while the full panel is open. */
	isExpanded: boolean;
	/** Collapse to `hidden`. */
	hide: () => void;
	/** Snap to the narrow `peek` state. */
	peek: () => void;
	/** Open the full panel — the edge-pill reopen target and open-file (F33) sink. */
	expand: () => void;
	/** Force a specific state. */
	setState: (state: RightPanelState) => void;
	/** Cycle `hidden → peek → expanded → hidden`. */
	cycle: () => void;
}

export interface UseRightPanelStateOptions {
	/**
	 * Inject a store to bind to instead of the default DOM-backed singleton.
	 * Desktop wraps its persisted prefs row in a store; mobile creates one with
	 * an AsyncStorage adapter; tests pass an in-memory store.
	 */
	store?: RightPanelStore;
}

const SERVER_SNAPSHOT: RightPanelSnapshot = { state: "expanded" };

export function useRightPanelState(
	options: UseRightPanelStateOptions = {},
): UseRightPanelStateResult {
	const store = options.store ?? getDefaultStore();
	const snapshot = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		() => SERVER_SNAPSHOT,
	);

	return {
		state: snapshot.state,
		isHidden: snapshot.state === "hidden",
		isPeek: snapshot.state === "peek",
		isExpanded: snapshot.state === "expanded",
		hide: store.hide,
		peek: store.peek,
		expand: store.expand,
		setState: store.setState,
		cycle: store.cycle,
	};
}
