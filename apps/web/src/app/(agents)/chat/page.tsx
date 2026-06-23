import { AgentsHeader } from "../components/AgentsHeader";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { WebQuickChatView } from "./components/WebQuickChatView";

export default async function AgentsChatPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<div className="flex h-[100dvh] flex-col">
			{hasAgentsUiAccess && <AgentsHeader />}
			<WebQuickChatView />
		</div>
	);
}
