"use client";

import { authClient } from "@rox/auth/client";
import { IssueBoardPanel } from "./IssueBoardPanel";
import { resolveIssueBoardGate } from "./resolveIssueBoardGate";

/**
 * Client gate for the issue-board surface. Reads the active organization from the
 * session and applies the pure {@link resolveIssueBoardGate} (which reuses the
 * `projectOs.issueBoard` experimental feature). When the gate is closed — no org,
 * kill switch, or a future demote of the feature — the surface stays inert and
 * explains why rather than issuing org-less `task.list` / `graph.projectGraph`
 * calls. The org id is handed to the panel so its `v2Project.list` (a jwt
 * procedure needing the org id) and the org-scoped task reads always have a scope.
 */
export function IssueBoardGateClient() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveIssueBoardGate({ organizationId });

	if (!gate.enabled || !organizationId) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Доска задач недоступна для текущего контекста.
			</div>
		);
	}

	return <IssueBoardPanel organizationId={organizationId} />;
}
