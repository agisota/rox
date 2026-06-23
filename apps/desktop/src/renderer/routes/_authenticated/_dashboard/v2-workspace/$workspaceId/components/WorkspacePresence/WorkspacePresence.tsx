import { dashboardRoomId } from "@rox/collab/types";
import { useCallback } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { PresenceRoom } from "./PresenceRoom";

interface WorkspacePresenceProps {
	workspaceId: string;
}

/**
 * Workspace-header affordance for live Liveblocks presence ("who's here") on
 * the desktop workspace surface. Ports the proven web `DashboardPresence`
 * pattern (`PresenceRoom` + `@rox/collab/client` + `@rox/ui` `PresenceStack`)
 * into one desktop surface, reusing the same Liveblocks client unchanged.
 *
 * Gated behind the `collaboration.presence` experiment, which only resolves to
 * `available` when the Liveblocks provider env is configured (both
 * `LIVEBLOCKS_SECRET_KEY` and `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, resolved in
 * the main process by `settings.experimentalFeatures`). When that env is
 * absent the gate resolves `needs_configuration` and `ExperimentalFeatureGate`
 * renders its fallback (nothing) — so this degrades cleanly with no provider,
 * no network, and no broken UI.
 *
 * The token mint is delegated to the cloud `collab.authRoom` tRPC mutation, so
 * the client never holds `LIVEBLOCKS_SECRET_KEY`.
 */
export function WorkspacePresence({ workspaceId }: WorkspacePresenceProps) {
	return (
		<ExperimentalFeatureGate featureId="collaboration.presence">
			<WorkspacePresenceInner workspaceId={workspaceId} />
		</ExperimentalFeatureGate>
	);
}

function WorkspacePresenceInner({ workspaceId }: WorkspacePresenceProps) {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const authEndpoint = useCallback(async (roomId: string) => {
		const { token } = await apiTrpcClient.collab.authRoom.mutate({ roomId });
		return { token };
	}, []);

	// Without an active organization we cannot scope a room; render nothing
	// rather than open a room that can only ever fail authorization.
	if (!organizationId) return null;

	return (
		<PresenceRoom
			authEndpoint={authEndpoint}
			roomId={dashboardRoomId(organizationId, workspaceId)}
		/>
	);
}
