import { alert } from "@rox/ui/atoms/Alert";
import { toast } from "@rox/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import type { DashboardSidebarProject } from "../../../../types";

interface UseDashboardSidebarProjectSectionActionsOptions {
	project: DashboardSidebarProject;
}

export function useDashboardSidebarProjectSectionActions({
	project,
}: UseDashboardSidebarProjectSectionActionsOptions) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	const { v2Projects: projectActions } = useOptimisticCollectionActions();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
		toggleProjectCollapsed,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(project.name);

	const startRename = () => {
		setRenameValue(project.name);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(project.name);
	};

	const submitRename = () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === project.name) return;
		projectActions.renameProject(project.id, trimmed);
	};

	const handleOpenInFinder = () => {
		toast.info("«Открыть в Finder» скоро появится");
	};

	const handleOpenSettings = () => {
		navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: project.id },
		});
	};

	const confirmRemoveFromSidebar = () => {
		alert({
			title: "Убрать проект с боковой панели?",
			description:
				"Это уберёт рабочие пространства с боковой панели и удалит все секции проекта. Сами рабочие пространства и проекты удалены не будут.",
			actions: [
				{ label: "Отмена", variant: "outline", onClick: () => {} },
				{
					label: "Убрать",
					variant: "destructive",
					onClick: () => removeProjectFromSidebar(project.id),
				},
			],
		});
	};

	const handleNewWorkspace = () => {
		openModal(project.id);
	};

	const handleNewSection = () => {
		const sectionId = createSection(project.id);
		requestSectionRename(sectionId);
		if (project.isCollapsed) {
			toggleProjectCollapsed(project.id);
		}
	};

	return {
		cancelRename,
		confirmRemoveFromSidebar,
		deleteSection,
		handleNewSection,
		handleNewWorkspace,
		handleOpenInFinder,
		handleOpenSettings,
		isRenaming,
		renameSection,
		renameValue,
		setRenameValue,
		startRename,
		submitRename,
		toggleSectionCollapsed,
	};
}
