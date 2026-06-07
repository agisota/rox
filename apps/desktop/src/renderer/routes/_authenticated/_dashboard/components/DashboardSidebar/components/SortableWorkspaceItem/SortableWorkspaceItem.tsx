import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useShouldAnimate } from "renderer/motion";
import type { DashboardSidebarWorkspace } from "../../types";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

interface SortableWorkspaceItemProps {
	sortableId: string;
	workspace: DashboardSidebarWorkspace;
	accentColor?: string | null;
	isInSection?: boolean;
	onHoverCardOpen?: () => void;
	shortcutLabel?: string;
	disabled?: boolean;
}

export function SortableWorkspaceItem({
	sortableId,
	workspace,
	accentColor,
	isInSection,
	onHoverCardOpen,
	shortcutLabel,
	disabled,
}: SortableWorkspaceItemProps) {
	const {
		setNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({ id: sortableId, disabled });
	const shouldAnimate = useShouldAnimate("essential");

	return (
		<motion.div
			ref={setNodeRef}
			layout={shouldAnimate ? "position" : false}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
				borderLeft: accentColor ? `2px solid ${accentColor}` : undefined,
			}}
			{...attributes}
			{...listeners}
		>
			<DashboardSidebarWorkspaceItem
				workspace={workspace}
				onHoverCardOpen={onHoverCardOpen}
				shortcutLabel={shortcutLabel}
				isInSection={isInSection}
			/>
		</motion.div>
	);
}
