import { redirect } from "next/navigation";
import { getAgentsUiAccess } from "../../utils/getAgentsUiAccess";
import { ObjectCommentsGateClient } from "./ObjectCommentsGateClient";

/**
 * Object-comments page (`collaboration.threadsAsObjects`). Behind the same
 * agents-UI access flag as the rest of the `(agents)` surface; the per-feature
 * gate (org + experimental-feature state) is applied client-side in
 * {@link ObjectCommentsGateClient}.
 *
 * The thread is anchored to the `?object=<entityId>` route param (with optional
 * `?project=<v2ProjectId>` scope for a freshly-created thread) — deep-linked
 * from object surfaces such as the unified search; with no object selected the
 * gate client renders an inert hint rather than faking an entity id.
 */
export default async function ObjectCommentsPage({
	searchParams,
}: {
	searchParams: Promise<{ object?: string; project?: string }>;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	if (!hasAgentsUiAccess) {
		redirect("/agents");
	}

	const { object, project } = await searchParams;

	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<ObjectCommentsGateClient entityId={object} v2ProjectId={project} />
		</div>
	);
}
