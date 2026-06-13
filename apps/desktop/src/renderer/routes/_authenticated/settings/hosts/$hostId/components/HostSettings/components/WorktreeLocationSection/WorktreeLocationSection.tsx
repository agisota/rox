import {
	useSetV2WorktreeBaseDir,
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "../../../../../../components/V2WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	isOnline: boolean;
	canEdit: boolean;
}

export function WorktreeLocationSection({
	hostUrl,
	hostName,
	isRemoteTarget,
	isOnline,
	canEdit,
}: WorktreeLocationSectionProps) {
	const settingsQuery = useV2WorktreeLocationSettings(hostUrl, {
		enabled: isOnline,
	});
	const setLocation = useSetV2WorktreeBaseDir(hostUrl);

	const disabled =
		!canEdit ||
		!isOnline ||
		!hostUrl ||
		settingsQuery.isLoading ||
		setLocation.isPending;

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">Расположение worktree</h3>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Расположение по умолчанию для новых worktree-рабочих областей на этом
					хосте.
				</p>
			</div>
			<V2WorktreeLocationPicker
				currentPath={settingsQuery.data?.worktreeBaseDir ?? null}
				fallbackPath={settingsQuery.data?.defaultWorktreeBaseDir ?? null}
				hostUrl={hostUrl}
				hostName={hostName}
				isRemoteTarget={isRemoteTarget}
				disabled={disabled}
				browseTitle="Выберите расположение worktree по умолчанию"
				onSelect={(path) => setLocation.mutate(path)}
				onReset={() => setLocation.mutate(null)}
			/>
			{!canEdit ? (
				<p className="text-xs text-muted-foreground">
					Изменить это расположение могут только владельцы хоста.
				</p>
			) : null}
		</section>
	);
}
