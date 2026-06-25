import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { CoverageBadge } from "../CoverageBadge/CoverageBadge";

export interface SkillsPanelProps {
	personaId: string;
}

/**
 * Per-persona Skills panel (F47, #644). Lists the persona's assigned skills with
 * an enabled toggle and a coverage badge. Toggling flips
 * `profileCapabilities.setSkillEnabled` and refreshes the list + coverage.
 */
export function SkillsPanel({ personaId }: SkillsPanelProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const skillsQuery = useQuery(
		trpc.profileCapabilities.listSkills.queryOptions({ personaId }),
	);
	const coverageQuery = useQuery(
		trpc.profileCapabilities.skillCoverage.queryOptions({ personaId }),
	);

	const setEnabled = useMutation(
		trpc.profileCapabilities.setSkillEnabled.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.profileCapabilities.listSkills.queryKey({
							personaId,
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.profileCapabilities.skillCoverage.queryKey({
							personaId,
						}),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось обновить навык");
			},
		}),
	);

	const skills = skillsQuery.data ?? [];

	if (skills.length === 0 && skillsQuery.isLoading) {
		return (
			<div className="space-y-2 pt-3">
				<Skeleton className="h-12 w-full rounded-lg" />
				<Skeleton className="h-12 w-full rounded-lg" />
			</div>
		);
	}

	return (
		<div className="space-y-3 pt-3">
			<div className="flex items-center justify-between">
				<h3 className="font-medium text-sm">Навыки персоны</h3>
				{coverageQuery.data ? (
					<CoverageBadge
						enabled={coverageQuery.data.enabled}
						total={coverageQuery.data.total}
					/>
				) : null}
			</div>

			{skills.length === 0 ? (
				<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
					Этой персоне ещё не назначены навыки.
				</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{skills.map((skill) => (
						<li
							key={skill.skillId}
							className="flex items-center justify-between gap-4 p-3"
						>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">{skill.name}</p>
								{skill.description ? (
									<p className="truncate text-muted-foreground text-xs">
										{skill.description}
									</p>
								) : null}
							</div>
							<Switch
								checked={skill.enabled}
								disabled={setEnabled.isPending}
								onCheckedChange={(enabled) =>
									setEnabled.mutate({
										personaId,
										skillId: skill.skillId,
										enabled,
									})
								}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
