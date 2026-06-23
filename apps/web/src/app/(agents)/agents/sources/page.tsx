import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { SourcesGateClient } from "./components/SourcesGateClient";

/**
 * Connect-a-source management page. Behind the same agents-UI access flag as the
 * rest of the `(agents)` surface; the per-feature `agentNative.sourceMarketplace`
 * gate (org + experimental-feature state) is applied client-side in
 * {@link SourcesGateClient}.
 */
export default async function SourcesPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<SourcesGateClient />
		</div>
	);
}
