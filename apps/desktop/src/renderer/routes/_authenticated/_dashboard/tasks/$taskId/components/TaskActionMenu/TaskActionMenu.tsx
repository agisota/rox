import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { useState } from "react";
import {
	HiEllipsisHorizontal,
	HiOutlineDocumentDuplicate,
	HiOutlineTrash,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";

interface TaskActionMenuProps {
	task: TaskWithStatus;
	onDelete?: () => void;
}

export function TaskActionMenu({ task, onDelete }: TaskActionMenuProps) {
	const { tasks: taskActions } = useOptimisticCollectionActions();
	const [open, setOpen] = useState(false);

	const { copyToClipboard } = useCopyToClipboard();

	const handleCopyId = () => {
		copyToClipboard(task.slug);
		setOpen(false);
	};

	const handleCopyTitle = () => {
		copyToClipboard(task.title);
		setOpen(false);
	};

	const handleDelete = () => {
		const transaction = taskActions.deleteTask(task.id);
		if (transaction) {
			setOpen(false);
			onDelete?.();
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					aria-label="Открыть действия с задачей"
				>
					<HiEllipsisHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuItem onSelect={handleCopyId}>
					<HiOutlineDocumentDuplicate className="size-4" />
					<span>Копировать ID</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={handleCopyTitle}>
					<HiOutlineDocumentDuplicate className="size-4" />
					<span>Копировать название</span>
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					onSelect={handleDelete}
					className="text-destructive focus:text-destructive"
				>
					<HiOutlineTrash className="text-destructive size-4" />
					<span>Удалить</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
