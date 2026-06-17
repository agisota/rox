import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@rox/ui/context-menu";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { HiCheck } from "react-icons/hi2";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuPalette,
	LuPencil,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { useDashboardSidebarHover } from "../../../../providers/DashboardSidebarHoverProvider";

interface DashboardSidebarWorkspaceContextMenuProps {
	projectId: string;
	isInSection?: boolean;
	isLocalWorkspace: boolean;
	isPinned?: boolean;
	isUnread: boolean;
	showDeleteHotkey?: boolean;
	color?: string | null;
	onSetColor?: (color: string | null) => void;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	onOpenInFinder: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onRemoveFromSidebar: () => void;
	onRename: () => void;
	onDelete?: () => void;
	onToggleUnread: () => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	projectId,
	isInSection,
	isLocalWorkspace,
	isPinned = false,
	isUnread,
	showDeleteHotkey = false,
	color = null,
	onSetColor,
	onCreateSection,
	onMoveToSection,
	onOpenInFinder,
	onCopyPath,
	onCopyBranchName,
	onRemoveFromSidebar,
	onRename,
	onDelete,
	onToggleUnread,
	children,
}: DashboardSidebarWorkspaceContextMenuProps) {
	const collections = useCollections();
	const { setContextMenuOpen } = useDashboardSidebarHover();
	const deleteHotkeyText = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const showDeleteShortcut =
		showDeleteHotkey && deleteHotkeyText !== "Unassigned";
	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.where(({ sidebarSections }) =>
					eq(sidebarSections.projectId, projectId),
				)
				.orderBy(({ sidebarSections }) => sidebarSections.tabOrder, "asc")
				.select(({ sidebarSections }) => ({
					id: sidebarSections.sectionId,
					name: sidebarSections.name,
					color: sidebarSections.color,
				})),
		[collections, projectId],
	);

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuItem onSelect={onRename}>
					<LuPencil className="size-4 mr-2" />
					Переименовать
				</ContextMenuItem>
				{isLocalWorkspace && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onOpenInFinder}>
							<LuFolderOpen className="size-4 mr-2" />
							Открыть в Finder
						</ContextMenuItem>
						<ContextMenuItem onSelect={onCopyPath}>
							<LuCopy className="size-4 mr-2" />
							Скопировать путь
						</ContextMenuItem>
					</>
				)}
				{!isLocalWorkspace && <ContextMenuSeparator />}
				<ContextMenuItem onSelect={onCopyBranchName}>
					<LuGitBranch className="size-4 mr-2" />
					Скопировать имя ветки
				</ContextMenuItem>
				{onSetColor && (
					<>
						<ContextMenuSeparator />
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<LuPalette className="size-4 mr-2" />
								Цвет ветки
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="max-h-80 overflow-y-auto">
								{[
									{ name: "По умолчанию", value: PROJECT_COLOR_DEFAULT },
									...PROJECT_COLORS,
								].map((option) => {
									const isDefault = option.value === PROJECT_COLOR_DEFAULT;
									const isSelected =
										(color ?? PROJECT_COLOR_DEFAULT) === option.value;
									return (
										<ContextMenuItem
											key={option.value}
											onSelect={() =>
												onSetColor(isDefault ? null : option.value)
											}
										>
											<span
												className="relative mr-2 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border/50"
												style={
													isDefault
														? undefined
														: { backgroundColor: option.value }
												}
											>
												{isDefault ? (
													<span className="size-1.5 rounded-full bg-muted-foreground/35" />
												) : null}
											</span>
											{option.name}
											{isSelected ? (
												<HiCheck className="ml-auto size-3.5 text-muted-foreground" />
											) : null}
										</ContextMenuItem>
									);
								})}
							</ContextMenuSubContent>
						</ContextMenuSub>
					</>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onToggleUnread}>
					{isUnread ? (
						<>
							<LuEye className="size-4 mr-2" />
							Отметить как прочитанное
						</>
					) : (
						<>
							<LuEyeOff className="size-4 mr-2" />
							Отметить как непрочитанное
						</>
					)}
				</ContextMenuItem>
				{!isPinned && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onSelect={onCreateSection}>
							<LuFolderPlus className="size-4 mr-2" />
							Новая группа из рабочего пространства
						</ContextMenuItem>
						{(sections.length > 0 || isInSection) && <ContextMenuSeparator />}
						{sections.length > 0 && (
							<ContextMenuSub>
								<ContextMenuSubTrigger>
									<LuArrowRightLeft className="size-4 mr-2" />
									Переместить в группу
								</ContextMenuSubTrigger>
								<ContextMenuSubContent>
									{sections.map((section) => (
										<ContextMenuItem
											key={section.id}
											onSelect={() => onMoveToSection(section.id)}
										>
											{section.color && (
												<span
													className="size-2 shrink-0 rounded-full mr-2"
													style={{ backgroundColor: section.color }}
												/>
											)}
											{section.name}
										</ContextMenuItem>
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
						)}
						{isInSection && (
							<ContextMenuItem onSelect={() => onMoveToSection(null)}>
								<LuArrowUp className="size-4 mr-2" />
								Разгруппировать
							</ContextMenuItem>
						)}
					</>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={onRemoveFromSidebar}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2 text-destructive" />
					Убрать с боковой панели
				</ContextMenuItem>
				{onDelete ? (
					<ContextMenuItem
						onSelect={onDelete}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						Удалить
						{showDeleteShortcut && (
							<ContextMenuShortcut>{deleteHotkeyText}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				) : null}
			</ContextMenuContent>
		</ContextMenu>
	);
}
