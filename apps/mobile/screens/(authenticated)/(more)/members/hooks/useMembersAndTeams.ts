import type { RouterOutputs } from "@rox/trpc";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/trpc/client";

export type OrgMember =
	RouterOutputs["organization"]["members"]["list"][number];
export type OrgTeam = RouterOutputs["team"]["list"][number];

interface UseMembersAndTeamsResult {
	members: OrgMember[];
	teams: OrgTeam[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

/**
 * Read-only members + teams for the active org via the plain tRPC client.
 * The organization has no Electric collection for this view, so this mirrors
 * Drive's manual lifecycle (useDriveFolder): state for data/loading/error plus
 * an imperative refresh for pull-to-refresh. RN adapter for Hermes-borrow F27.
 */
export function useMembersAndTeams(): UseMembersAndTeamsResult {
	const [members, setMembers] = useState<OrgMember[]>([]);
	const [teams, setTeams] = useState<OrgTeam[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const [memberRows, teamRows] = await Promise.all([
				apiClient.organization.members.list.query({}),
				apiClient.team.list.query(),
			]);
			setMembers(memberRows);
			setTeams(teamRows);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Не удалось загрузить данные",
			);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		setIsLoading(true);
		void load();
	}, [load]);

	const refresh = useCallback(async () => {
		await load();
	}, [load]);

	return { members, teams, isLoading, error, refresh };
}
