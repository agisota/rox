import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { CrmContactsGateClient } from "./CrmContactsGateClient";

/**
 * CRM contacts page. Behind the same agents-UI access flag as the rest of the
 * `(agents)` surface; the per-feature `projectOs.crmContacts` gate (org +
 * experimental-feature state) is applied client-side in
 * {@link CrmContactsGateClient}.
 */
export default async function CrmContactsPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	return (
		<div className="mx-auto w-full max-w-4xl px-4 py-6">
			<CrmContactsGateClient />
		</div>
	);
}
