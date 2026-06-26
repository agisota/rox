import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	createZenModeStore,
	ZEN_MODE_STORAGE_KEY,
	type ZenModeStore,
} from "@rox/shared/zen-mode";
import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";

/**
 * Mobile Focus / Zen mode store (F56, Hermes-borrow #649).
 *
 * Mobile consumes the SAME platform-neutral `@rox/shared/zen-mode` core as
 * desktop and web — there is no per-platform copy of the on/off semantics. The
 * only mobile-specific concern is persistence: AsyncStorage is async whereas the
 * core's `ZenModeStorage` is synchronous, so instead of injecting it we run the
 * core in-memory and bridge it to AsyncStorage with effects (hydrate on mount,
 * write on change). This mirrors the F44 mobile command-palette idiom: a React
 * context, no zustand dependency added.
 */

const ZenModeContext = createContext<ZenModeStore | null>(null);

export function ZenModeProvider({ children }: { children: ReactNode }) {
	// One store instance per provider mount (stable across renders).
	const storeRef = useRef<ZenModeStore | null>(null);
	if (!storeRef.current) storeRef.current = createZenModeStore();
	const store = storeRef.current;

	// Hydrate the persisted value once on mount.
	useEffect(() => {
		let cancelled = false;
		void AsyncStorage.getItem(ZEN_MODE_STORAGE_KEY).then((raw) => {
			if (cancelled || raw == null) return;
			try {
				const parsed = JSON.parse(raw) as { active?: boolean } | null;
				if (typeof parsed?.active === "boolean") store.setActive(parsed.active);
			} catch {
				// Corrupt persisted value — ignore and keep the default.
			}
		});
		return () => {
			cancelled = true;
		};
	}, [store]);

	// Persist every change back to AsyncStorage (best-effort).
	useEffect(() => {
		return store.subscribe(() => {
			void AsyncStorage.setItem(
				ZEN_MODE_STORAGE_KEY,
				JSON.stringify(store.getSnapshot()),
			);
		});
	}, [store]);

	return createElement(ZenModeContext.Provider, { value: store }, children);
}

export interface UseZenModeResult {
	isZen: boolean;
	enterZen: () => void;
	exitZen: () => void;
	toggleZen: () => void;
}

export function useZenMode(): UseZenModeResult {
	const store = useContext(ZenModeContext);
	if (!store) {
		throw new Error("useZenMode must be used within a ZenModeProvider");
	}
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
	return useMemo(
		() => ({
			isZen: snapshot.active,
			enterZen: store.enter,
			exitZen: store.exit,
			toggleZen: store.toggle,
		}),
		[snapshot.active, store],
	);
}
