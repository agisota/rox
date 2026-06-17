import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useShouldAnimate } from "@rox/ui/motion";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useSidebarDnd } from "../../../../hooks/useSidebarDnd";
import { parseId } from "../../../../hooks/useSidebarDnd/useSidebarDnd";
import type { DashboardSidebarProjectChild } from "../../../../types";
import { SidebarDragOverlay } from "../../../SidebarDragOverlay";
import { SortableSectionHeader } from "../../../SortableSectionHeader";
import { SortableWorkspaceItem } from "../../../SortableWorkspaceItem";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	projectChildren: DashboardSidebarProjectChild[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	projectChildren,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	const {
		sensors,
		measuring,
		collisionDetection,
		flatItems,
		sortableItems,
		activeId,
		activeType,
		activeItem,
		predictedColor,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
		handlers,
	} = useSidebarDnd({ projectId, projectChildren });

	const shouldAnimate = useShouldAnimate("decorative");
	const isDragging = activeId != null;
	const layoutEnabled = shouldAnimate && !isDragging;

	return (
		<AnimatePresence initial={false}>
			{!isCollapsed && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<div className="pb-1">
						<DndContext
							sensors={sensors}
							collisionDetection={collisionDetection}
							measuring={measuring}
							{...handlers}
						>
							<SortableContext
								items={sortableItems}
								strategy={verticalListSortingStrategy}
							>
								<LayoutGroup id="dashboard-sidebar-rail">
									{flatItems.map((id) => {
										const parsed = parseId(id);
										if (!parsed) return null;

										if (parsed.type === "section") {
											const section = sectionsById.get(parsed.realId);
											if (!section) return null;
											return (
												<SortableSectionHeader
													key={String(id)}
													sortableId={String(id)}
													section={section}
													onDelete={onDeleteSection}
													onRename={onRenameSection}
													onToggleCollapse={onToggleSectionCollapse}
												/>
											);
										}

										const workspace = workspacesById.get(parsed.realId);
										if (!workspace) return null;
										const group = groupInfo.get(parsed.realId);
										const isInSection = !!group;
										const isInCollapsedSection =
											isInSection && collapsedSectionIds.has(group.sectionId);
										const hidden =
											isInCollapsedSection ||
											(activeType === "section" && isInSection);

										return (
											<AnimatePresence key={String(id)} initial={false}>
												{!hidden && (
													<motion.div
														layout={layoutEnabled ? "position" : false}
														initial={{ height: 0, opacity: 0 }}
														animate={{ height: "auto", opacity: 1 }}
														exit={{ height: 0, opacity: 0 }}
														transition={{
															duration: shouldAnimate ? 0.15 : 0,
															ease: "easeOut",
														}}
													>
														<SortableWorkspaceItem
															sortableId={String(id)}
															workspace={workspace}
															accentColor={
																activeId === id ? predictedColor : group?.color
															}
															isInSection={groupInfo.has(parsed.realId)}
															onHoverCardOpen={() =>
																onWorkspaceHover(parsed.realId)
															}
															shortcutLabel={workspaceShortcutLabels.get(
																parsed.realId,
															)}
															disabled={
																workspace.type === "main" &&
																workspace.hostType === "local-device"
															}
														/>
													</motion.div>
												)}
											</AnimatePresence>
										);
									})}
								</LayoutGroup>
							</SortableContext>

							{createPortal(
								<DragOverlay dropAnimation={null}>
									{activeId ? (
										<SidebarDragOverlay activeItem={activeItem} />
									) : null}
								</DragOverlay>,
								document.body,
							)}
						</DndContext>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
