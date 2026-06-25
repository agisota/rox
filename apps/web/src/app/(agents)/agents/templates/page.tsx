import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { TemplateMarketplaceGateClient } from "./TemplateMarketplaceGateClient";

/**
 * Template-marketplace page (`templates.marketplace`). Behind the same agents-UI
 * access flag as the rest of the `(agents)` surface; the per-feature gate
 * (experimental-feature state) is applied client-side in
 * {@link TemplateMarketplaceGateClient}.
 */
export default async function TemplateMarketplacePage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	return (
		<div className="mx-auto w-full max-w-4xl px-4 py-6">
			<TemplateMarketplaceGateClient />
		</div>
	);
}
