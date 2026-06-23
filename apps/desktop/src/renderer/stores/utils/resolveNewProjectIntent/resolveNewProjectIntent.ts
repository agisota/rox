import type { NewProjectIntent } from "../../add-repository-modal";

export interface NavigateToWorkspaceCommand {
	kind: "navigate-workspace";
	workspaceId: string;
}

export type NewProjectNavDecision =
	| NavigateToWorkspaceCommand
	| { kind: "none" };

/**
 * Pure post-create decision: navigate into the project's main-workspace ONLY
 * when the caller asked to "open" and a workspace id is known. Otherwise stay.
 */
export function resolveNewProjectIntent(
	intent: NewProjectIntent,
	mainWorkspaceId: string | null | undefined,
): NewProjectNavDecision {
	if (intent === "open" && mainWorkspaceId) {
		return { kind: "navigate-workspace", workspaceId: mainWorkspaceId };
	}
	return { kind: "none" };
}
