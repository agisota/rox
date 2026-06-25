import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PromptEntry } from "../../lib/types";
import { PromptCard } from "./PromptCard";

export interface SortablePromptRowProps {
	prompt: PromptEntry;
	availableFolders: string[];
	sortable: boolean;
	onInsert: (prompt: PromptEntry) => void;
	onCopy: (prompt: PromptEntry) => void;
	onEdit: (prompt: PromptEntry) => void;
	onDelete: (prompt: PromptEntry) => void;
	onDuplicate: (prompt: PromptEntry) => void;
	onToggleFavorite: (prompt: PromptEntry) => void;
	onMoveToFolder: (prompt: PromptEntry, folder: string | null) => void;
}

/**
 * Sortable wrapper around a {@link PromptCard}. When `sortable` is false (e.g.
 * a filtered/searched view where manual order is meaningless) it renders the
 * card without drag wiring, so reorder only happens in the manual layouts.
 */
export function SortablePromptRow({
	prompt,
	sortable,
	...cardProps
}: SortablePromptRowProps) {
	const {
		setNodeRef,
		transform,
		transition,
		attributes,
		listeners,
		isDragging,
	} = useSortable({ id: prompt.id, disabled: !sortable });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style}>
			<PromptCard
				prompt={prompt}
				{...cardProps}
				dragHandleProps={sortable ? listeners : undefined}
				dragHandleAttributes={sortable ? attributes : undefined}
				isDragging={isDragging}
			/>
		</div>
	);
}
