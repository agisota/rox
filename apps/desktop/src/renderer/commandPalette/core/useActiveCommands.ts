import { resolveActiveCommands } from "@rox/shared/command-palette";
import { useMemo, useSyncExternalStore } from "react";
import { getProviders, subscribeToProviders } from "./registry";
import { resolveSectionOrder, SECTION_LABELS } from "./sections";
import type { CommandContext, CommandSection } from "./types";

export function useActiveCommands(context: CommandContext): CommandSection[] {
	const providers = useSyncExternalStore(
		subscribeToProviders,
		getProviders,
		getProviders,
	);

	return useMemo(
		() =>
			resolveActiveCommands(providers, context, {
				order: resolveSectionOrder(context),
				labels: SECTION_LABELS,
			}) as CommandSection[],
		[providers, context],
	);
}
