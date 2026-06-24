import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { SourcesManager } from "../SourcesManager";

interface SourcesLaunchpadProps {
	/**
	 * Optional fallback rendered when `agentNative.sourceMarketplace` is off /
	 * unavailable. Defaults to an inert "feature unavailable" notice so OFF means
	 * the management surface is genuinely absent (no regression vs. today, where
	 * the desktop has no sources route at all).
	 */
	fallback?: React.ReactNode;
}

/**
 * Gated, self-contained entry point for the desktop Agent Sources management
 * surface — the desktop parity of the web `(agents)/agents/sources` page
 * (`SourcesGateClient` + `SourcesManager`).
 *
 * Renders the {@link SourcesManager} (list + connect/edit over the cross-platform
 * `agentSource` CRUD) ONLY when `agentNative.sourceMarketplace` resolves usable
 * (enabled AND `available`) via {@link ExperimentalFeatureGate} — the same
 * experimental feature the web surface reuses (no new flag, no flip). When the
 * gate is closed the surface stays fully inert (default fallback), so disabling
 * the feature removes the surface exactly as if it were never built.
 */
export function SourcesLaunchpad({
	fallback = (
		<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
			Подключение источников агентов недоступно для текущего контекста.
		</div>
	),
}: SourcesLaunchpadProps) {
	return (
		<ExperimentalFeatureGate
			featureId="agentNative.sourceMarketplace"
			fallback={fallback}
		>
			<SourcesManager />
		</ExperimentalFeatureGate>
	);
}
