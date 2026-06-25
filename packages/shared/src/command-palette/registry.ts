import type { CommandProvider } from "./types";

/**
 * A command-provider registry. Instance-based (not a module-level singleton) so
 * each host — and each test — can own an isolated registry. Desktop preserves
 * its historical global-singleton behavior via {@link createCommandRegistry}
 * called once at module scope (see `apps/desktop/.../core/registry.ts`).
 *
 * Exposes a `useSyncExternalStore`-compatible `subscribe`/`getSnapshot` pair so
 * React hosts can drive re-renders without coupling the core to React.
 */
export interface CommandRegistry<Ctx = unknown> {
	registerProvider: (provider: CommandProvider<Ctx>) => () => void;
	getProviders: () => CommandProvider<Ctx>[];
	subscribe: (listener: () => void) => () => void;
}

export function createCommandRegistry<Ctx = unknown>(): CommandRegistry<Ctx> {
	const providers = new Map<string, CommandProvider<Ctx>>();
	const listeners = new Set<() => void>();
	let snapshot: CommandProvider<Ctx>[] = [];

	function rebuildSnapshot(): void {
		snapshot = Array.from(providers.values());
	}

	function notify(): void {
		rebuildSnapshot();
		for (const listener of listeners) listener();
	}

	return {
		registerProvider(provider) {
			providers.set(provider.id, provider);
			notify();
			return () => {
				providers.delete(provider.id);
				notify();
			};
		},
		getProviders() {
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
