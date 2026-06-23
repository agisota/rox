import type { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { useNewWorkspaceModalDraft } from "../../../../NewWorkspaceModalDraftContext";
import type { OpenableWorktreeAction } from "../../utils/resolveOpenableWorktrees";
import { resolveOpenableWorktrees } from "../../utils/resolveOpenableWorktrees";

interface UseBranchResolutionParams {
	projectId: string | null;
	compareBaseBranch: string | null;
	closeModal: () => void;
	navigate: ReturnType<typeof useNavigate>;
	openTrackedWorktree: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["openTrackedWorktree"];
	openExternalWorktree: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["openExternalWorktree"];
	runAsyncAction: ReturnType<
		typeof useNewWorkspaceModalDraft
	>["runAsyncAction"];
	updateDraft: ReturnType<typeof useNewWorkspaceModalDraft>["updateDraft"];
}

/**
 * Encapsulates the branch/worktree resolution logic for the new-workspace
 * prompt: branch + worktree queries, the derived lookup maps, the effective
 * compare-base branch, and the worktree/workspace open handlers.
 *
 * Behavior-preserving extraction from PromptGroupInner — same queries, same
 * memo dependency arrays, same effect ordering.
 */
export function useBranchResolution({
	projectId,
	compareBaseBranch,
	closeModal,
	navigate,
	openTrackedWorktree,
	openExternalWorktree,
	runAsyncAction,
	updateDraft,
}: UseBranchResolutionParams) {
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const {
		data: localBranchData,
		isLoading: isLocalBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	// Show local data immediately (fast, no network), upgrade to remote when available
	const branchData = remoteBranchData ?? localBranchData;
	// Only show loading while waiting for the fast local query
	const isBranchesLoading = isLocalBranchesLoading && !branchData;

	const { data: externalWorktrees = [] } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const { data: trackedWorktrees = [] } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const worktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) set.add(wt.branch);
		for (const wt of trackedWorktrees) set.add(wt.branch);
		return set;
	}, [externalWorktrees, trackedWorktrees]);

	// Fetch active workspaces for this project
	const { data: activeWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const activeWorkspacesByBranch = useMemo(() => {
		const map = new Map<string, string>(); // branch → workspaceId
		for (const ws of activeWorkspaces) {
			if (ws.projectId === projectId && !ws.deletingAt) {
				map.set(ws.branch, ws.id);
			}
		}
		return map;
	}, [activeWorkspaces, projectId]);

	// Resolve openable worktrees (no active workspace)
	const openableWorktrees = useMemo(
		() => resolveOpenableWorktrees(trackedWorktrees, externalWorktrees),
		[trackedWorktrees, externalWorktrees],
	);

	// Map external worktree paths for badge display
	const externalWorktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) {
			set.add(wt.branch);
		}
		return set;
	}, [externalWorktrees]);

	const effectiveCompareBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: compareBaseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const previousProjectIdRef = useRef(projectId);

	useEffect(() => {
		if (previousProjectIdRef.current === projectId) {
			return;
		}
		previousProjectIdRef.current = projectId;
		updateDraft({ compareBaseBranch: null });
	}, [projectId, updateDraft]);

	const handleCompareBaseBranchSelect = useCallback(
		(selectedBaseBranch: string) => {
			updateDraft({ compareBaseBranch: selectedBaseBranch });
		},
		[updateDraft],
	);

	const handleOpenWorktree = useCallback(
		(action: OpenableWorktreeAction) => {
			if (!projectId) return;

			if (action.type === "tracked") {
				void runAsyncAction(
					openTrackedWorktree.mutateAsync({
						worktreeId: action.worktreeId,
					}),
					{
						loading: "Opening worktree...",
						success: "Worktree opened",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Не удалось открыть worktree",
					},
				);
			} else {
				void runAsyncAction(
					openExternalWorktree.mutateAsync({
						projectId,
						worktreePath: action.worktreePath,
					}),
					{
						loading: "Opening worktree...",
						success: "Worktree opened",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Не удалось открыть worktree",
					},
				);
			}
		},
		[
			projectId,
			runAsyncAction,
			openExternalWorktree.mutateAsync,
			openTrackedWorktree.mutateAsync,
		],
	);

	const handleOpenActiveWorkspace = useCallback(
		(workspaceId: string) => {
			closeModal();
			void navigateToWorkspace(workspaceId, navigate);
		},
		[closeModal, navigate],
	);

	return {
		project,
		branchData,
		isBranchesLoading,
		isBranchesError,
		worktreeBranches,
		activeWorkspacesByBranch,
		openableWorktrees,
		externalWorktreeBranches,
		effectiveCompareBaseBranch,
		handleCompareBaseBranchSelect,
		handleOpenWorktree,
		handleOpenActiveWorkspace,
	};
}
