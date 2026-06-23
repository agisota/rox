import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { UnifiedSearchGateClient } from "./UnifiedSearchGateClient";

/**
 * Unified-search page. Behind the same agents-UI access flag as the rest of the
 * `(agents)` surface; the per-feature `projectOs.unifiedSearch` gate (org +
 * experimental-feature state) is applied client-side in
 * {@link UnifiedSearchGateClient}.
 */
export default async function UnifiedSearchPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<UnifiedSearchGateClient />
		</div>
	);
}
