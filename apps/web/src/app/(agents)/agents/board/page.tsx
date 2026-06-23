import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { IssueBoardGateClient } from "./IssueBoardGateClient";

/**
 * Issue-board page. Behind the same agents-UI access flag as the rest of the
 * `(agents)` surface; the per-feature `projectOs.issueBoard` gate (org +
 * experimental-feature state) is applied client-side in
 * {@link IssueBoardGateClient}.
 */
export default async function IssueBoardPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	return (
		<div className="mx-auto w-full max-w-screen-2xl px-4 py-6">
			<IssueBoardGateClient />
		</div>
	);
}
