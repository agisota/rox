import { toast } from "@rox/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "../../../../../../components/V2WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	projectId: string;
	currentPath: string | null;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	isHostOnline: boolean;
	isProjectSetup: boolean;
	onChanged?: () => void;
}

export function WorktreeLocationSection({
	projectId,
	currentPath,
	hostUrl,
	hostName,
	isRemoteTarget,
	isHostOnline,
	isProjectSetup,
	onChanged,
}: WorktreeLocationSectionProps) {
	const hostSettingsQuery = useV2WorktreeLocationSettings(hostUrl, {
		enabled: isHostOnline,
	});

	const setLocation = useMutation({
		mutationFn: async (path: string | null) => {
			if (!hostUrl) throw new Error("Хост недоступен");
			return getHostServiceClientByUrl(
				hostUrl,
			).project.setWorktreeBaseDir.mutate({ projectId, path });
		},
		onSuccess: (_data, path) => {
			toast.success(
				path
					? "Расположение worktree проекта обновлено"
					: "Расположение worktree проекта сброшено",
			);
			onChanged?.();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : String(err));
		},
	});

	return (
		<V2WorktreeLocationPicker
			currentPath={currentPath}
			fallbackPath={
				hostSettingsQuery.data?.worktreeBaseDir ??
				hostSettingsQuery.data?.defaultWorktreeBaseDir ??
				null
			}
			hostUrl={hostUrl}
			hostName={hostName}
			isRemoteTarget={isRemoteTarget}
			disabled={
				!hostUrl ||
				!isHostOnline ||
				!isProjectSetup ||
				hostSettingsQuery.isLoading ||
				setLocation.isPending
			}
			browseTitle="Выберите расположение worktree проекта"
			browseDescription={`Выберите папку worktree проекта на ${hostName}.`}
			onSelect={(path) => setLocation.mutate(path)}
			onReset={() => setLocation.mutate(null)}
		/>
	);
}
