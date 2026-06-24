import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";

export interface DeleteTarget {
	kind: "file" | "folder";
	id: string;
	name: string;
}

interface DeleteAlertProps {
	target: DeleteTarget | null;
	pending: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

/**
 * Destructive confirm for delete, replacing the web app's `window.confirm`.
 * Folder copy warns that contents go too. Files may be soft-trashed server-side
 * when still referenced by chat/email/canvas attachments; the action hook
 * surfaces «Перемещено в корзину» vs «Удалено» after the mutation resolves.
 */
export function DeleteAlert({
	target,
	pending,
	onConfirm,
	onOpenChange,
}: DeleteAlertProps) {
	const isFolder = target?.kind === "folder";
	return (
		<AlertDialog open={target !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{isFolder ? "Удалить папку?" : "Удалить файл?"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{isFolder ? (
							<>
								Папка «{target?.name}» и всё её содержимое будут удалены. Это
								действие необратимо.
							</>
						) : (
							<>
								Файл «{target?.name}» будет удалён. Если на него ссылаются
								вложения чата или почты, он переместится в корзину и освободит
								место, когда исчезнет последняя ссылка.
							</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Отмена</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{pending ? "Удаление…" : "Удалить"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
