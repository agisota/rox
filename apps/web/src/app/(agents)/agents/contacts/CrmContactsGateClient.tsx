"use client";

import { authClient } from "@rox/auth/client";
import { CrmContactsPanel } from "./CrmContactsPanel";
import { resolveCrmContactsGate } from "./resolveCrmContactsGate";

/**
 * Client gate for the CRM-contacts surface. Reads the active organization from
 * the session and applies the pure {@link resolveCrmContactsGate} (which reuses
 * the `projectOs.crmContacts` experimental feature). When the gate is closed —
 * no org, kill switch, or a future demote of the feature — the surface stays
 * inert and explains why rather than issuing org-less `graph.listContacts` calls.
 */
export function CrmContactsGateClient() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveCrmContactsGate({ organizationId });

	if (!gate.enabled) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Контакты недоступны для текущего контекста.
			</div>
		);
	}

	return <CrmContactsPanel />;
}
