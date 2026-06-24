import { WorkspaceClientProvider as WorkspaceTrpcProvider } from "@rox/workspace-client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceHeaders } from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { E2E_CANVAS_FIXTURE } from "shared/constants";
import type { AccessibleV2Workspace } from "../v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useAccessibleV2Workspaces } from "../v2-workspaces/hooks/useAccessibleV2Workspaces";
import { CanvasSurface } from "./CanvasSurface";
import { selectDefaultCanvasWorkspace } from "./canvasWorkspaceSelection";

export const Route = createFileRoute("/_authenticated/_dashboard/canvas/")({
	component: CanvasPage,
});

const LAST_ACTIVE_CANVAS_WORKSPACE_ID_KEY =
	"rox.canvas.last-active-workspace-id";

function readLastActiveCanvasWorkspaceId(): string | null {
	try {
		return window.localStorage.getItem(LAST_ACTIVE_CANVAS_WORKSPACE_ID_KEY);
	} catch {
		return null;
	}
}

function saveLastActiveCanvasWorkspaceId(workspaceId: string): void {
	try {
		window.localStorage.setItem(
			LAST_ACTIVE_CANVAS_WORKSPACE_ID_KEY,
			workspaceId,
		);
	} catch {
		// Best effort only; route selection still works from accessible workspaces.
	}
}

function createE2ECanvasWorkspace(
	machineId: string | null,
): AccessibleV2Workspace | null {
	if (!machineId) return null;
	return {
		id: E2E_CANVAS_FIXTURE.workspaceId,
		name: "Canvas smoke workspace",
		branch: "main",
		type: "main",
		createdAt: new Date("2026-06-17T00:00:00.000Z"),
		createdByUserId: null,
		createdByName: null,
		createdByImage: null,
		isCreatedByCurrentUser: false,
		projectId: E2E_CANVAS_FIXTURE.projectId,
		projectName: "Rox Canvas Smoke",
		projectRepoId: null,
		projectGithubOwner: "agisota",
		hostId: machineId,
		hostName: "This device",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: true,
		pr: null,
	};
}

function CanvasPage() {
	const { all, pinned } = useAccessibleV2Workspaces();
	const { activeHostUrl, machineId } = useLocalHostService();
	const lastActiveWorkspaceId = useMemo(readLastActiveCanvasWorkspaceId, []);
	const e2eFallbackWorkspace = env.E2E_AUTH_BYPASS
		? createE2ECanvasWorkspace(machineId)
		: null;
	const selectedWorkspace = selectDefaultCanvasWorkspace({
		all,
		pinned,
		lastActiveWorkspaceId,
		isE2EAuthBypass: env.E2E_AUTH_BYPASS,
		e2eFallbackWorkspace,
	});

	useEffect(() => {
		if (!selectedWorkspace) return;
		saveLastActiveCanvasWorkspaceId(selectedWorkspace.id);
	}, [selectedWorkspace]);

	if (!selectedWorkspace) {
		return <CanvasSurface />;
	}

	if (!activeHostUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground text-sm">
				Запуск локального холста…
			</div>
		);
	}

	return (
		<WorkspaceTrpcProvider
			cacheKey={selectedWorkspace.id}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
		>
			<CanvasSurface workspaceId={selectedWorkspace.id} />
		</WorkspaceTrpcProvider>
	);
}
