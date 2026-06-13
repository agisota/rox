import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import type { DirectoryEntry } from "shared/file-tree-types";

interface DeleteConfirmDialogProps {
	entry: DirectoryEntry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting?: boolean;
}

export function DeleteConfirmDialog({
	entry,
	open,
	onOpenChange,
	onConfirm,
	isDeleting = false,
}: DeleteConfirmDialogProps) {
	if (!entry) return null;

	const itemType = entry.isDirectory ? "папку" : "файл";
	const title = `Удалить ${itemType} «${entry.name}»?`;
	const description = entry.isDirectory
		? "Эта папка и всё её содержимое будут перемещены в корзину. Это действие можно отменить из системной корзины."
		: "Этот файл будет перемещён в корзину. Это действие можно отменить из системной корзины.";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Отмена
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
						disabled={isDeleting}
					>
						{isDeleting ? "Удаление..." : "Удалить"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
