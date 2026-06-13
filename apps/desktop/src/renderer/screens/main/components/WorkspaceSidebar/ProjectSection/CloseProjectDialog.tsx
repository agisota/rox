import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";

interface CloseProjectDialogProps {
	projectName: string;
	workspaceCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function CloseProjectDialog({
	projectName,
	workspaceCount,
	open,
	onOpenChange,
	onConfirm,
}: CloseProjectDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Закрыть проект «{projectName}»?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block">
								Будут закрыты рабочие пространства этого проекта (количество:{" "}
								{workspaceCount}) и завершены все активные терминалы.
							</span>
							<span className="block">
								Ваши файлы и история git останутся на диске.
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Отмена
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={onConfirm}
					>
						Закрыть проект
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
