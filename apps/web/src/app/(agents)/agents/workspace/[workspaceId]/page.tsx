import { notFound } from "next/navigation";
import {
	getLatestMockSessionByWorkspaceId,
	getMockDiffFilesForSession,
	getMockMessagesForSession,
	getMockWorkspaceById,
} from "../../../mock-data";
import { SessionPageContent } from "./components/SessionPageContent";

// Access is gated uniformly at the `(agents)` layout (WS-B T6): if the flag is
// off the layout renders the request-access view and this page never runs, so
// there is no longer a per-page `redirect("/")` here (that divergence was the
// 404 symptom). Real-host binding replaces the mock branch in WS-B P1 (T4).
export default async function WorkspaceDetailPage({
	params,
}: {
	params: Promise<{ workspaceId: string }>;
}) {
	const { workspaceId } = await params;
	const workspace = getMockWorkspaceById(workspaceId);
	const session = workspace
		? getLatestMockSessionByWorkspaceId(workspace.id)
		: undefined;

	if (!workspace || !session) {
		notFound();
	}

	return (
		<SessionPageContent
			diffFiles={getMockDiffFilesForSession(session.id)}
			messages={getMockMessagesForSession(session.id)}
			session={session}
			workspaceId={workspace.id}
		/>
	);
}
