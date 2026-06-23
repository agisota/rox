import { AgentsAccessGate } from "./components/AgentsAccessGate";
import { getAgentsUiAccess } from "./utils/getAgentsUiAccess";

/**
 * Single access decision for the whole `(agents)` route group (WS-B T6).
 *
 * This kills the old "mixed gate" 404: index pages used to always render while
 * the Workspace detail route hard-`redirect("/")`d when the flag was off, and
 * the layout swapped in legacy dashboard chrome. Now ONE check here decides:
 * flag explicitly off → a uniform request-access view; flag on → the bare
 * full-height shell, with each page rendering its own AgentsHeader.
 *
 * Resilience: a PostHog outage FAILS OPEN (see `resolveAgentsUiAccess`) — it
 * returns `hasAgentsUiAccess: true` with `degraded: true`, so an infra failure
 * renders the shell rather than locking everyone out. The `degraded` flag is
 * forwarded to the gate only for the defensive deny-while-degraded path.
 */
export default async function AgentsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { hasAgentsUiAccess, degraded } = await getAgentsUiAccess();

	if (!hasAgentsUiAccess) {
		return <AgentsAccessGate degraded={degraded} />;
	}

	return (
		<div className="flex min-h-[100dvh] flex-col bg-background">{children}</div>
	);
}
