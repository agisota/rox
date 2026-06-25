import { createCommandRegistry } from "@rox/shared/command-palette";
import type { CommandContext, CommandProvider } from "./types";

/**
 * Desktop preserves its historical global-singleton registry by instantiating
 * the shared (F44) registry once at module scope. The provider/snapshot/notify
 * semantics now live in `@rox/shared/command-palette`.
 */
const registry = createCommandRegistry<CommandContext>();

export function registerProvider(provider: CommandProvider): () => void {
	return registry.registerProvider(provider);
}

export function getProviders(): CommandProvider[] {
	return registry.getProviders() as CommandProvider[];
}

export function subscribeToProviders(listener: () => void): () => void {
	return registry.subscribe(listener);
}
