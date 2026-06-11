import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { AnimatedAlertDialogContent } from "renderer/motion";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
}

export function DeleteProjectSection({
	projectId,
	projectName,
}: DeleteProjectSectionProps) {
	const navigate = useNavigate();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "удалить проект",
			});
			return;
		}
		setIsDeleting(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			await client.project.remove.mutate({ projectId });
			toast.success(`Проект "${projectName}" удалён`);
			setIsOpen(false);
			navigate({ to: "/settings/projects" });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Не удалось удалить");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">Удаление проекта</div>
			</div>
			{!isOwner ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								className="pointer-events-none shrink-0"
								disabled
							>
								Удалить проект
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left">
						Удалять этот проект могут только владельцы организации.
					</TooltipContent>
				</Tooltip>
			) : (
				<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							className="shrink-0"
						>
							Удалить проект
						</Button>
					</AlertDialogTrigger>
					<AnimatedAlertDialogContent open={isOpen}>
						<AlertDialogHeader>
							<AlertDialogTitle>Удалить «{projectName}»?</AlertDialogTitle>
							<AlertDialogDescription>
								Проект будет удалён для{" "}
								<span className="font-medium text-foreground">всех</span> в
								организации, а все его рабочие пространства будут удалены с
								устройств участников. Это действие нельзя отменить.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isDeleting}>
								Отмена
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={(e) => {
									e.preventDefault();
									handleDelete();
								}}
								disabled={isDeleting || !activeHostUrl}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isDeleting ? "Удаление…" : "Удалить"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AnimatedAlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
