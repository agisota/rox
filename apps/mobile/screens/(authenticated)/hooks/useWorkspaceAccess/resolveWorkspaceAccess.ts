/**
 * Pure workspace-access resolver (FN-086).
 *
 * Mobile workspace screens must respect organization / project ownership from
 * `@rox/auth` and degrade gracefully through the auth edge cases instead of
 * querying Electric for an org the user cannot see. The decision is a pure
 * function of the session + the project being viewed, so it is unit-testable
 * without auth/Electric and reused identically by the list and detail screens.
 */

export type WorkspaceAccessState =
	/** No authenticated user — the session is signed out / expired. */
	| "signedOut"
	/** Signed in, but no active organization is selected. */
	| "noOrg"
	/** Signed in with an active org, but the target is owned by another org. */
	| "noAccess"
	/** Signed in, active org owns the target — render the workspace. */
	| "ok"
	/** Auth/project still loading — callers show a skeleton, not an error. */
	| "loading";

export interface WorkspaceAccessInput {
	/** Active user id from the session, or null/undefined when signed out. */
	userId: string | null | undefined;
	/** Active organization id from the session, or null when none selected. */
	activeOrganizationId: string | null | undefined;
	/** Whether the auth session has finished its initial load. */
	isSessionPending?: boolean;
	/**
	 * Owning organization id of the project/workspace being viewed. Undefined
	 * means the project row has not synced yet (still resolving), null means it
	 * is known to have no org. Omit entirely for org-list screens that aren't
	 * scoped to a single project.
	 */
	projectOrganizationId?: string | null;
	/**
	 * Whether the project lookup has settled. When false and no
	 * `projectOrganizationId` is known yet, access is `loading` rather than
	 * `noAccess`, so a slow sync doesn't flash an error state.
	 */
	isProjectResolved?: boolean;
}

export function resolveWorkspaceAccess({
	userId,
	activeOrganizationId,
	isSessionPending,
	projectOrganizationId,
	isProjectResolved,
}: WorkspaceAccessInput): WorkspaceAccessState {
	// Still waiting on the very first session load: don't claim signed-out yet.
	if (isSessionPending && !userId) return "loading";

	if (!userId) return "signedOut";
	if (!activeOrganizationId) return "noOrg";

	// Org-list screens pass no project scope: an active org is sufficient.
	if (projectOrganizationId === undefined && isProjectResolved === undefined) {
		return "ok";
	}

	// Project scope requested but not resolved yet -> loading (avoid false deny).
	if (projectOrganizationId === undefined) {
		return isProjectResolved ? "noAccess" : "loading";
	}

	// Project resolved with no/blank org, or owned by a different org -> deny.
	if (
		!projectOrganizationId ||
		projectOrganizationId !== activeOrganizationId
	) {
		return "noAccess";
	}

	return "ok";
}

/** Whether the resolved access state should render workspace content. */
export function canAccessWorkspace(state: WorkspaceAccessState): boolean {
	return state === "ok";
}
