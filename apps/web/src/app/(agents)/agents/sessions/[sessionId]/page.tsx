import { notFound } from "next/navigation";

import { AgentsHeader } from "../../../components/AgentsHeader";
import { SessionDetailDashboard } from "../../../components/SessionDetailDashboard";
import { getAgentsUiAccess } from "../../../utils/getAgentsUiAccess";
import { loadAgentsSessionDetail } from "../../data";

export default async function AgentSessionDetailPage({
	params,
}: {
	params: Promise<{ sessionId: string }>;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	const { sessionId } = await params;
	const detail = await loadAgentsSessionDetail({ sessionId });

	if (!detail) {
		notFound();
	}

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
			<SessionDetailDashboard session={detail} />
		</>
	);
}
