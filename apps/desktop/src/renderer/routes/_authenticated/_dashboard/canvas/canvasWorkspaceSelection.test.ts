import { describe, expect, it } from "bun:test";
import type { AccessibleV2Workspace } from "../v2-workspaces/hooks/useAccessibleV2Workspaces";
import { selectDefaultCanvasWorkspace } from "./canvasWorkspaceSelection";

function workspace(
	id: string,
	overrides: Partial<AccessibleV2Workspace> = {},
): AccessibleV2Workspace {
	return {
		id,
		name: id,
		branch: "main",
		type: "main",
		createdAt: new Date("2026-06-17T00:00:00.000Z"),
		createdByUserId: null,
		createdByName: null,
		createdByImage: null,
		isCreatedByCurrentUser: false,
		projectId: `project-${id}`,
		projectName: `Project ${id}`,
		projectRepoId: null,
		projectGithubOwner: null,
		hostId: "host-1",
		hostName: "Local Host",
		hostIsOnline: true,
		hostType: "local-device",
		isInSidebar: false,
		pr: null,
		...overrides,
	};
}

describe("selectDefaultCanvasWorkspace", () => {
	it("prefers the last active accessible workspace over pinned and recency", () => {
		const recent = workspace("recent");
		const pinned = workspace("pinned", { isInSidebar: true });
		const lastActive = workspace("last-active");

		expect(
			selectDefaultCanvasWorkspace({
				all: [recent, pinned, lastActive],
				pinned: [pinned],
				lastActiveWorkspaceId: "last-active",
			})?.id,
		).toBe("last-active");
	});

	it("falls back to a pinned workspace before the newest accessible workspace", () => {
		const newest = workspace("newest");
		const pinned = workspace("pinned", { isInSidebar: true });

		expect(
			selectDefaultCanvasWorkspace({
				all: [newest, pinned],
				pinned: [pinned],
				lastActiveWorkspaceId: "missing",
			})?.id,
		).toBe("pinned");
	});

	it("returns the first accessible workspace when nothing is pinned", () => {
		const newest = workspace("newest");
		const older = workspace("older");

		expect(
			selectDefaultCanvasWorkspace({
				all: [newest, older],
				pinned: [],
				lastActiveWorkspaceId: null,
			})?.id,
		).toBe("newest");
	});

	it("uses an e2e fallback workspace only when the scoped auth bypass is active", () => {
		const fallback = workspace("00000000-0000-4000-8000-000000000003");
		const staleLocal = workspace("stale-local");

		expect(
			selectDefaultCanvasWorkspace({
				all: [staleLocal],
				pinned: [staleLocal],
				lastActiveWorkspaceId: "stale-local",
				isE2EAuthBypass: true,
				e2eFallbackWorkspace: fallback,
			})?.id,
		).toBe("00000000-0000-4000-8000-000000000003");

		expect(
			selectDefaultCanvasWorkspace({
				all: [],
				pinned: [],
				lastActiveWorkspaceId: null,
				isE2EAuthBypass: false,
				e2eFallbackWorkspace: fallback,
			}),
		).toBeNull();
	});
});
