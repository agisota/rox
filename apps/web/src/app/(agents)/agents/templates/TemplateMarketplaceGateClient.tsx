"use client";

import { resolveTemplateMarketplaceGate } from "./resolveTemplateMarketplaceGate";
import { TemplateMarketplacePanel } from "./TemplateMarketplacePanel";

/**
 * Client gate for the template-marketplace surface. Applies the pure
 * {@link resolveTemplateMarketplaceGate} (which reuses the `templates.marketplace`
 * experimental feature). The catalog is static client data, so unlike the
 * graph-backed surfaces this gate needs no active org — just the
 * experimental-feature state. When the gate is closed (kill switch or a future
 * demote of the feature) the surface stays inert and explains why.
 */
export function TemplateMarketplaceGateClient() {
	const gate = resolveTemplateMarketplaceGate();

	if (!gate.enabled) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Маркетплейс шаблонов недоступен для текущего контекста.
			</div>
		);
	}

	return <TemplateMarketplacePanel />;
}
