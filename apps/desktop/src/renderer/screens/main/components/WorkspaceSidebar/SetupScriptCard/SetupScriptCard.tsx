import { SidebarCard } from "@rox/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SetupScriptCardProps {
	isCollapsed?: boolean;
	projectId: string | null;
	projectName: string | null;
}

export function SetupScriptCard({
	isCollapsed,
	projectId,
	projectName,
}: SetupScriptCardProps) {
	const { data: shouldShow } = electronTrpc.config.shouldShowSetupCard.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId, refetchOnWindowFocus: true },
	);

	const dismissMutation = electronTrpc.config.dismissSetupCard.useMutation();
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();

	if (isCollapsed || !projectId || !projectName || !shouldShow) {
		return null;
	}

	const handleDismiss = () => {
		dismissMutation.mutate(
			{ projectId },
			{
				onSuccess: () =>
					utils.config.shouldShowSetupCard.invalidate({ projectId }),
			},
		);
	};

	return (
		<AnimatePresence>
			<motion.div
				key={projectId}
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: 10 }}
				transition={{ duration: 0.2 }}
				className="px-3 pb-2"
			>
				<SidebarCard
					badge="Настройка"
					title="Скрипты настройки"
					description={`Автоматизация настройки рабочего пространства для ${projectName}`}
					actionLabel="Настроить"
					onAction={() =>
						navigate({
							to: "/settings/projects/$projectId",
							params: { projectId },
						})
					}
					onDismiss={handleDismiss}
				/>
			</motion.div>
		</AnimatePresence>
	);
}
