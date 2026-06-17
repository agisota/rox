import type { AccessibleV2Workspace } from "../v2-workspaces/hooks/useAccessibleV2Workspaces";

export function selectDefaultCanvasWorkspace({
	all,
	pinned,
	lastActiveWorkspaceId,
	isE2EAuthBypass,
	e2eFallbackWorkspace,
}: {
	all: AccessibleV2Workspace[];
	pinned: AccessibleV2Workspace[];
	lastActiveWorkspaceId?: string | null;
	isE2EAuthBypass?: boolean;
	e2eFallbackWorkspace?: AccessibleV2Workspace | null;
}): AccessibleV2Workspace | null {
	const lastActive = lastActiveWorkspaceId
		? all.find((workspace) => workspace.id === lastActiveWorkspaceId)
		: null;
	if (lastActive) return lastActive;
	return (
		pinned[0] ??
		all[0] ??
		(isE2EAuthBypass ? (e2eFallbackWorkspace ?? null) : null)
	);
}
