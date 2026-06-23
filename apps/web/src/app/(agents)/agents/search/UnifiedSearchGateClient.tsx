"use client";

import { authClient } from "@rox/auth/client";
import { resolveUnifiedSearchGate } from "./resolveUnifiedSearchGate";
import { UnifiedSearchPanel } from "./UnifiedSearchPanel";

/**
 * Client gate for the unified-search surface. Reads the active organization from
 * the session and applies the pure {@link resolveUnifiedSearchGate} (which reuses
 * the `projectOs.unifiedSearch` experimental feature). When the gate is closed —
 * no org, kill switch, or a future demote of the feature — the surface stays
 * inert and explains why rather than issuing org-less `graph.search` calls.
 */
export function UnifiedSearchGateClient() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveUnifiedSearchGate({ organizationId });

	if (!gate.enabled) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Единый поиск недоступен для текущего контекста.
			</div>
		);
	}

	return <UnifiedSearchPanel />;
}
