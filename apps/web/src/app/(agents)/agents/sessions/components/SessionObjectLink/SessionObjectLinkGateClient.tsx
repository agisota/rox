"use client";

import { authClient } from "@rox/auth/client";
import { resolveObjectLinkedChatGate } from "./resolveObjectLinkedChatGate";
import { SessionObjectLinkPanel } from "./SessionObjectLinkPanel";

/**
 * Client gate for the object-linked-chat control. Reads the active organization
 * from the session and applies the pure {@link resolveObjectLinkedChatGate}
 * (which reuses the `projectOs.objectLinkedChat` experimental feature). When the
 * gate is closed — no org, no session, kill switch, or a future demote of the
 * feature — the control renders nothing rather than issuing org-less graph
 * calls. This keeps the session detail page clean for users outside the
 * experiment while exposing the real control to those inside it.
 */
export function SessionObjectLinkGateClient({
	sessionId,
	sessionTitle,
}: {
	sessionId: string;
	sessionTitle?: string | null;
}) {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveObjectLinkedChatGate({ organizationId, sessionId });

	if (!gate.enabled) {
		return null;
	}

	return (
		<SessionObjectLinkPanel sessionId={sessionId} sessionTitle={sessionTitle} />
	);
}
