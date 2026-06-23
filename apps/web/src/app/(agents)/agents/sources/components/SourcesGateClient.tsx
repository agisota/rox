"use client";

import { authClient } from "@rox/auth/client";
import { resolveSourcesGate } from "../resolveSourcesGate";
import { SourcesManager } from "./SourcesManager";

/**
 * Client gate for the connect-a-source surface. Reads the active organization
 * from the session and applies the pure {@link resolveSourcesGate} (which reuses
 * the `agentNative.sourceMarketplace` experimental feature). When the gate is
 * closed — no org, kill switch, or a future demote of the feature — the surface
 * stays inert and explains why rather than issuing org-less CRUD calls.
 */
export function SourcesGateClient() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveSourcesGate({ organizationId });

	if (!gate.enabled) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Подключение источников агентов недоступно для текущего контекста.
			</div>
		);
	}

	return <SourcesManager />;
}
