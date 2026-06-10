import { toast } from "@rox/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";

export function FileMenuListener() {
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error("Import failed", {
				description: `Этот репозиторий используют несколько проектов (${candidates.length}). Выберите проект в настройках, чтобы настроить его на этом устройстве.`,
				action: {
					label: "Open Projects",
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: async (event) => {
			if (event.type !== "open-project") return;
			const result = await folderImport.start();
			if (result) {
				toast.success("Project ready — open it from the sidebar.");
			}
		},
	});

	return null;
}
