import { buildHostRoutingKey } from "@rox/shared/host-routing";
import { notFound } from "next/navigation";
import { api } from "@/trpc/server";
import {
	getLatestMockSessionByWorkspaceId,
	getMockDiffFilesForSession,
	getMockMessagesForSession,
	getMockWorkspaceById,
} from "../../../mock-data";
import { SessionPageContent } from "./components/SessionPageContent";
import { resolveWorkspaceView } from "./resolveWorkspaceView";

// Access is gated uniformly at the `(agents)` layout (WS-B T6): if the flag is
// off the layout renders the request-access view and this page never runs, so
// there is no longer a per-page `redirect("/")` here (that divergence was the
// 404 symptom).
//
// WS-B T4: when a `?host=` routing key resolves AND the user has access to that
// host, render a LIVE session bound to the real host over the relay (D6 read
// plane A). Otherwise fall back to the existing mock prototype (kept, not
// deleted); `notFound()` only when neither a reachable host nor a mock session
// exists.
export default async function WorkspaceDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ workspaceId: string }>;
	searchParams: Promise<{ host?: string }>;
}) {
	const { workspaceId } = await params;
	const { host: hostParam } = await searchParams;

	const mockWorkspace = getMockWorkspaceById(workspaceId);
	const mockSession = mockWorkspace
		? getLatestMockSessionByWorkspaceId(mockWorkspace.id)
		: undefined;
	const hasMock = Boolean(mockWorkspace && mockSession);

	const { routingKey, accessAllowed } = await resolveHostAttach(
		workspaceId,
		hostParam,
	);

	const view = resolveWorkspaceView({ routingKey, accessAllowed, hasMock });

	if (view.kind === "notFound") {
		notFound();
	}

	if (view.kind === "live") {
		// Seed with the mock rows (cache-first) so panes are not blank while the
		// host's git/chat resolve over the relay.
		const seedSession =
			mockSession ?? getLatestMockSessionByWorkspaceId("workspace-1");
		if (!seedSession) {
			notFound();
		}
		return (
			<SessionPageContent
				diffFiles={
					mockSession ? getMockDiffFilesForSession(mockSession.id) : []
				}
				messages={mockSession ? getMockMessagesForSession(mockSession.id) : []}
				session={seedSession}
				liveHost={{
					routingKey: view.routingKey,
					workspaceId,
					sessionId: workspaceId,
					terminalId: null,
				}}
			/>
		);
	}

	// Mock path (unchanged behaviour).
	if (!mockSession) {
		notFound();
	}
	return (
		<SessionPageContent
			diffFiles={getMockDiffFilesForSession(mockSession.id)}
			messages={getMockMessagesForSession(mockSession.id)}
			session={mockSession}
		/>
	);
}

/**
 * Resolve the relay routing key + access for a `?host=` request. The `host`
 * param is the machine id; the routing key is derived from the active org so it
 * matches what `createRelayHostClient` dials. Returns no key when there is no
 * host param, no active org, or the workspace is not in the org.
 */
async function resolveHostAttach(
	workspaceId: string,
	hostParam: string | undefined,
): Promise<{ routingKey: string | null; accessAllowed: boolean }> {
	if (!hostParam) {
		return { routingKey: null, accessAllowed: false };
	}
	try {
		const trpc = await api();
		const organization = await trpc.organization.getActive.query();
		if (!organization) {
			return { routingKey: null, accessAllowed: false };
		}
		const workspace = await trpc.v2Workspace.getFromHost.query({
			organizationId: organization.id,
			id: workspaceId,
		});
		if (!workspace) {
			return { routingKey: null, accessAllowed: false };
		}
		const routingKey = buildHostRoutingKey(organization.id, hostParam);
		const access = await trpc.host.checkAccess.query({ hostId: routingKey });
		return { routingKey, accessAllowed: access.allowed };
	} catch {
		// A malformed `?host=`/workspace id (e.g. a mock id deep-linked with a
		// host param) must not 500 the page — fall through to mock/notFound.
		return { routingKey: null, accessAllowed: false };
	}
}
