import { AgentsHeader } from "../../components/AgentsHeader";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { PipelinesIndex } from "./components/PipelinesIndex";

/**
 * Agent Pipelines index — the project-gated entry to the canvas feature. Lists
 * the org's pipelines and creates new ones from templates. Gated by the same
 * agents-UI access flag as the rest of the `(agents)` surface.
 */
export default async function PipelinesPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
			<PipelinesIndex />
		</>
	);
}
