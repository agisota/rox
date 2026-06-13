import {
	AlertDialog,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Checkbox } from "@rox/ui/checkbox";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AnimatedAlertDialogContent } from "renderer/motion";
import {
	useCloseWorkspace,
	useDeleteWorkspace,
} from "renderer/react-query/workspaces";
import { deleteWithToast } from "renderer/routes/_authenticated/components/TeardownLogsDialog";
import { focusPrimaryDialogAction } from "./focus-primary-dialog-action";

const DELETE_STATUS_STALE_TIME_MS = 5_000;
const TERMINAL_COUNT_STALE_TIME_MS = 1_000;

interface DeleteWorkspaceDialogProps {
	workspaceId: string;
	workspaceName: string;
	workspaceType?: "worktree" | "branch";
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
	workspaceId,
	workspaceName,
	workspaceType = "worktree",
	open,
	onOpenChange,
}: DeleteWorkspaceDialogProps) {
	const isBranch = workspaceType === "branch";
	const deleteWorkspace = useDeleteWorkspace();
	const closeWorkspace = useCloseWorkspace();
	const setDeleteLocalBranchSetting =
		electronTrpc.settings.setDeleteLocalBranch.useMutation();

	const { data: deleteLocalBranchDefault } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery(undefined, {
			enabled: open && !isBranch,
		});
	const [deleteLocalBranch, setDeleteLocalBranch] = useState<boolean | null>(
		null,
	);
	const closeActionButtonRef = useRef<HTMLButtonElement | null>(null);
	const deleteLocalBranchChecked =
		deleteLocalBranch ?? deleteLocalBranchDefault ?? false;

	const { data: gitStatusData, isLoading: isLoadingGitStatus } =
		electronTrpc.workspaces.canDelete.useQuery(
			{ id: workspaceId },
			{
				enabled: open,
				staleTime: DELETE_STATUS_STALE_TIME_MS,
				refetchOnWindowFocus: false,
			},
		);

	const { data: terminalCountData } =
		electronTrpc.workspaces.canDelete.useQuery(
			{ id: workspaceId, skipGitChecks: true },
			{
				enabled: open,
				refetchInterval: open ? 2000 : false,
				staleTime: TERMINAL_COUNT_STALE_TIME_MS,
				refetchOnWindowFocus: false,
			},
		);

	const canDeleteData = gitStatusData
		? {
				...gitStatusData,
				activeTerminalCount:
					terminalCountData?.activeTerminalCount ??
					gitStatusData.activeTerminalCount,
			}
		: terminalCountData;
	const isLoading = isLoadingGitStatus;

	const handleClose = useCallback(() => {
		onOpenChange(false);

		toast.promise(closeWorkspace.mutateAsync({ id: workspaceId }), {
			loading: "Скрываем...",
			success: (result) => {
				if (result.terminalWarning) {
					setTimeout(() => {
						toast.warning("Предупреждение терминала", {
							description: result.terminalWarning,
						});
					}, 100);
				}
				return "Рабочее пространство скрыто";
			},
			error: (error) =>
				error instanceof Error ? error.message : "Не удалось скрыть",
		});
	}, [onOpenChange, closeWorkspace, workspaceId]);

	const handleDelete = useCallback(async () => {
		onOpenChange(false);

		setDeleteLocalBranchSetting.mutate({
			enabled: deleteLocalBranchChecked,
		});

		await deleteWithToast({
			name: workspaceName,
			deleteFn: () =>
				deleteWorkspace.mutateAsync({
					id: workspaceId,
					deleteLocalBranch: deleteLocalBranchChecked,
				}),
			forceDeleteFn: () =>
				deleteWorkspace.mutateAsync({
					id: workspaceId,
					deleteLocalBranch: deleteLocalBranchChecked,
					force: true,
				}),
		});
	}, [
		onOpenChange,
		setDeleteLocalBranchSetting,
		deleteLocalBranchChecked,
		workspaceName,
		deleteWorkspace,
		workspaceId,
	]);

	const canDelete = canDeleteData?.canDelete ?? true;
	const reason = canDeleteData?.reason;
	const hasChanges = canDeleteData?.hasChanges ?? false;
	const hasUnpushedCommits = canDeleteData?.hasUnpushedCommits ?? false;
	const hasWarnings = hasChanges || hasUnpushedCommits;

	// Handle Enter key press to trigger delete/close action
	useEffect(() => {
		if (!open) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey
			) {
				event.preventDefault();

				if (isBranch) {
					// For branch workspaces, Enter triggers close
					handleClose();
				} else {
					// For regular workspaces, Enter triggers delete if enabled
					if (canDelete && !isLoading) {
						handleDelete();
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		open,
		isBranch,
		canDelete,
		isLoading, // For branch workspaces, Enter triggers close
		handleClose,
		handleDelete,
	]);

	// For branch workspaces, use simplified dialog (only close option)
	if (isBranch) {
		return (
			<AlertDialog open={open} onOpenChange={onOpenChange}>
				<AnimatedAlertDialogContent
					open={open}
					className="max-w-[340px] gap-0 p-0"
					onOpenAutoFocus={(event) => {
						focusPrimaryDialogAction(event, closeActionButtonRef.current);
					}}
				>
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Закрыть рабочее пространство «{workspaceName}»?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									Рабочее пространство будет закрыто, а активные терминалы
									завершены. Ваша ветка и коммиты останутся в репозитории.
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
						<Button
							ref={closeActionButtonRef}
							variant="secondary"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleClose}
						>
							Закрыть
						</Button>
					</AlertDialogFooter>
				</AnimatedAlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AnimatedAlertDialogContent
				open={open}
				className="max-w-[340px] gap-0 p-0"
				onOpenAutoFocus={(event) => {
					focusPrimaryDialogAction(event, closeActionButtonRef.current);
				}}
			>
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Удалить рабочее пространство «{workspaceName}»?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							{isLoading ? (
								"Проверка состояния..."
							) : !canDelete ? (
								<span className="text-destructive">{reason}</span>
							) : (
								<span className="block">
									Удаление безвозвратно уберёт worktree. Вместо этого можно
									скрыть, чтобы сохранить файлы на диске.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{!isLoading && canDelete && hasWarnings && (
					<div className="px-4 pb-2">
						<div className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-md px-2.5 py-1.5">
							{hasChanges && hasUnpushedCommits
								? "Есть незакоммиченные изменения и неотправленные коммиты"
								: hasChanges
									? "Есть незакоммиченные изменения"
									: "Есть неотправленные коммиты"}
						</div>
					</div>
				)}

				{!isLoading && canDelete && (
					<div className="px-4 pb-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="delete-local-branch"
								checked={deleteLocalBranchChecked}
								onCheckedChange={(checked) =>
									setDeleteLocalBranch(checked === true)
								}
							/>
							<Label
								htmlFor="delete-local-branch"
								className="text-xs text-muted-foreground cursor-pointer select-none"
							>
								Также удалить локальную ветку
							</Label>
						</div>
					</div>
				)}

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						Отмена
					</Button>
					<Button
						ref={closeActionButtonRef}
						variant="secondary"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleClose}
					>
						Скрыть
					</Button>
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								variant="destructive"
								size="sm"
								className="h-7 px-3 text-xs"
								onClick={handleDelete}
								disabled={!canDelete || isLoading}
							>
								Удалить
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs max-w-[200px]">
							Безвозвратно удалить рабочее пространство и git worktree с диска.
						</TooltipContent>
					</Tooltip>
				</AlertDialogFooter>
			</AnimatedAlertDialogContent>
		</AlertDialog>
	);
}
