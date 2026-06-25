import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import {
	canAccessWorkspace,
	resolveWorkspaceAccess,
	type WorkspaceAccessState,
} from "./resolveWorkspaceAccess";

export interface UseWorkspaceAccessOptions {
	/**
	 * Owning org id of the project being viewed (from `useProjectDetail`).
	 * Undefined while the project row is still syncing.
	 */
	projectOrganizationId?: string | null;
	/** Whether the project lookup has settled (collection reported ready). */
	isProjectResolved?: boolean;
}

export interface UseWorkspaceAccessResult {
	/** Resolved access state for the current session + target. */
	access: WorkspaceAccessState;
	/** Convenience flag: true only when access === "ok". */
	canAccess: boolean;
	/** Active org id from the session, or null. */
	activeOrganizationId: string | null;
	/** Active user id from the session, or null. */
	userId: string | null;
}

/**
 * Gate mobile workspace screens on `@rox/auth` (FN-086). Wires the better-auth
 * session into the pure {@link resolveWorkspaceAccess} resolver so screens can
 * render the right empty state for each edge case (signed out, no org, no
 * access) instead of querying collections for an inaccessible org.
 *
 * Pass `projectOrganizationId` / `isProjectResolved` to gate a single workspace
 * by project ownership; omit them on org-list screens where an active org is
 * sufficient.
 */
export function useWorkspaceAccess(
	options: UseWorkspaceAccessOptions = {},
): UseWorkspaceAccessResult {
	const { data: session, isPending } = useSession();

	const userId = session?.user?.id ?? null;
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	const access = useMemo(
		() =>
			resolveWorkspaceAccess({
				userId,
				activeOrganizationId,
				isSessionPending: isPending,
				projectOrganizationId: options.projectOrganizationId,
				isProjectResolved: options.isProjectResolved,
			}),
		[
			userId,
			activeOrganizationId,
			isPending,
			options.projectOrganizationId,
			options.isProjectResolved,
		],
	);

	return {
		access,
		canAccess: canAccessWorkspace(access),
		activeOrganizationId,
		userId,
	};
}
