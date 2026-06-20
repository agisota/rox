import { AgentsHeader } from "../components/AgentsHeader";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { InboxScreen } from "./components/InboxScreen";

/**
 * Inbox — the team chat + unified inbox web surface (P1-CHAT-WEB).
 *
 * Lists the org's comms threads (`comms.listThreads`), opens a thread view with
 * message bubbles + a composer (`comms.getThread` / `sendMessage` / `markRead`),
 * and shows live presence + typing for the active thread via `@rox/collab`. Gated
 * by the same agents-UI access flag as the rest of the `(agents)` surface.
 */
export default async function InboxPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
			<InboxScreen />
		</>
	);
}
