import {
	ArchiveIcon,
	FileIcon,
	LinkIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useQuickOpenStore } from "renderer/commandPalette/ui/QuickOpen/quickOpenStore";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import type { Command, CommandProvider } from "../../core/types";
import { LinkTaskFrame } from "../../ui/LinkTask/LinkTaskFrame";

export const workspaceProvider: CommandProvider = {
	id: "workspace",
	provide: (context) => {
		if (!context.workspace) return [];
		const workspace = context.workspace;
		const isMain = workspace.workspaceType === "main";

		const commands: Command[] = [
			{
				id: "workspace.new",
				title: "Новая рабочая область",
				section: "workspace",
				icon: PlusIcon,
				hotkeyId: "NEW_WORKSPACE",
				run: () =>
					useNewWorkspaceModalStore.getState().openModal(workspace.projectId),
			},
			{
				id: "files.quickOpen",
				title: "Поиск файлов",
				section: "workspace",
				icon: FileIcon,
				keywords: ["выбор файла", "быстро открыть"],
				hotkeyId: "QUICK_OPEN",
				run: () =>
					useQuickOpenStore.getState().openFor({
						workspaceId: workspace.id,
					}),
			},
			{
				id: "workspace.linkTask",
				title: "Связать задачу",
				section: "workspace",
				icon: LinkIcon,
				keywords: ["issue", "Linear"],
				renderFrame: () => <LinkTaskFrame workspaceId={workspace.id} />,
			},
		];

		if (workspace.projectId) {
			commands.push({
				id: `workspace.removeFromSidebar:${workspace.id}`,
				title: "Убрать из боковой панели",
				section: "workspace",
				icon: ArchiveIcon,
				keywords: ["скрыть"],
				run: () =>
					useRemoveFromSidebarIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						projectId: workspace.projectId ?? "",
						isMain,
					}),
			});
		}

		if (!isMain) {
			commands.push({
				id: `workspace.delete:${workspace.id}`,
				title: `Удалить ${workspace.name}`,
				section: "workspace",
				icon: Trash2Icon,
				keywords: ["архив", "убрать", "закрыть"],
				hotkeyId: "CLOSE_WORKSPACE",
				run: () =>
					useDeleteWorkspaceIntent.getState().request({
						workspaceId: workspace.id,
						workspaceName: workspace.name,
					}),
			});
		}

		return commands;
	},
};
