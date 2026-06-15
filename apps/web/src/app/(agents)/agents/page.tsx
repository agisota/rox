import { AgentsCabinet } from "../components/AgentsCabinet";
import { AgentsHeader } from "../components/AgentsHeader";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { loadAgentsDashboardData } from "./data";

export default async function AgentsPage() {
	const { hasAgentsUiAccess, session } = await getAgentsUiAccess();
	const data = await loadAgentsDashboardData();

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
			<AgentsCabinet
				userName={session.user.name ?? session.user.email ?? "Пользователь"}
				data={data}
			/>
		</>
	);
}
