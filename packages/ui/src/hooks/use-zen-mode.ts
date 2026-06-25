import {
	createZenModeStore,
	type ZenModeSnapshot,
	type ZenModeStorage,
	type ZenModeStore,
} from "@rox/shared/zen-mode";
import { useSyncExternalStore } from "react";

/**
 * Focus / Zen mode — React binding (F56, Hermes-borrow #649).
 *
 * Thin React adapter over the platform-neutral `@rox/shared/zen-mode` store.
 * The store holds the shell-level on/off state; this hook subscribes a host
 * (desktop lead, web, mobile) to it via `useSyncExternalStore` and returns the
 * boolean plus the `enter`/`exit`/`toggle` controls. The collapse animation and
 * chrome dim live at the call site, driven by `@rox/ui/motion`'s `zenDensity` /
 * `zenSceneTransition` tokens and gated on `useShouldAnimate('decorative')`.
 *
 * Distinct from the diff-view `useFocusMode` (single-entry focus inside the
 * changes pane) — zen mode is the shell-level chrome collapse.
 */

/**
 * Browser/desktop-friendly persistence over `localStorage`, guarded for SSR and
 * private-mode access errors. Mobile passes its own `AsyncStorage`-shaped
 * adapter instead (see {@link useZenMode} options).
 */
function getWebStorage(): ZenModeStorage | undefined {
	if (typeof window === "undefined" || !window.localStorage) return undefined;
	return {
		getItem: (key) => window.localStorage.getItem(key),
		setItem: (key, value) => window.localStorage.setItem(key, value),
	};
}

/**
 * The default process-wide store for DOM hosts (desktop + web). Created lazily
 * so a server render never touches `window`. Hosts that need an isolated or
 * differently-persisted store (mobile, tests) pass one in via the hook options.
 */
let defaultStore: ZenModeStore | undefined;
function getDefaultStore(): ZenModeStore {
	if (!defaultStore) {
		defaultStore = createZenModeStore({ storage: getWebStorage() });
	}
	return defaultStore;
}

export interface UseZenModeResult {
	/** Whether the shell is collapsed into zen mode. */
	isZen: boolean;
	/** Collapse the shell into zen mode. */
	enterZen: () => void;
	/** Restore the full chrome. */
	exitZen: () => void;
	/** Flip the mode. */
	toggleZen: () => void;
}

export interface UseZenModeOptions {
	/**
	 * Inject a store to bind to instead of the default DOM-backed singleton.
	 * Mobile creates one from `@rox/shared/zen-mode` with an AsyncStorage adapter
	 * and shares it across screens; tests pass an in-memory store.
	 */
	store?: ZenModeStore;
}

const SERVER_SNAPSHOT: ZenModeSnapshot = { active: false };

export function useZenMode(options: UseZenModeOptions = {}): UseZenModeResult {
	const store = options.store ?? getDefaultStore();
	const snapshot = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		() => SERVER_SNAPSHOT,
	);

	return {
		isZen: snapshot.active,
		enterZen: store.enter,
		exitZen: store.exit,
		toggleZen: store.toggle,
	};
}
