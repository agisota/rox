import { createFileRoute } from "@tanstack/react-router";
import { SourcesLaunchpad } from "./components/SourcesLaunchpad";

/**
 * In-desktop Agent Sources management route (desktop parity of the web
 * `(agents)/agents/sources` page). Hosts the gated {@link SourcesLaunchpad},
 * which mounts the connect/manage surface only when
 * `agentNative.sourceMarketplace` is enabled and available — the same
 * experimental feature and the same cross-platform `agentSource` CRUD the web
 * surface uses (no new flag, no flip, no migration).
 *
 * The Agent-Native command palette's "Подключить источник агента" action
 * navigates here (via {@link AGENT_SOURCES_ROUTE_PATH}) once the feature is on,
 * replacing its previously-disabled "no in-desktop sources route yet" state.
 */
export const Route = createFileRoute(
	"/_authenticated/settings/agents/sources/",
)({
	component: AgentSourcesPage,
});

function AgentSourcesPage() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-6">
			<SourcesLaunchpad />
		</div>
	);
}
