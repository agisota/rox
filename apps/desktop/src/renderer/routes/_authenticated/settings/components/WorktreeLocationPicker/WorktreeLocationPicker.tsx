import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface WorktreeLocationPickerProps {
	currentPath: string | null | undefined;
	defaultPathLabel: string;
	dialogTitle?: string;
	defaultBrowsePath?: string | null;
	disabled?: boolean;
	onSelect: (path: string) => void;
	onReset: () => void;
}

export function useDefaultWorktreePath() {
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	return homeDir ? `${homeDir}/rox/worktrees` : "~/rox/worktrees";
}

export function WorktreeLocationPicker({
	currentPath,
	defaultPathLabel,
	dialogTitle = "Выберите папку worktree",
	defaultBrowsePath,
	disabled,
	onSelect,
	onReset,
}: WorktreeLocationPickerProps) {
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const handleBrowse = async () => {
		const result = await selectDirectory.mutateAsync({
			title: dialogTitle,
			defaultPath: defaultBrowsePath ?? undefined,
		});
		if (!result.canceled && result.path) {
			onSelect(result.path);
		}
	};

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">Папка</Label>
				<code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground block mt-1">
					{currentPath ?? defaultPathLabel}
				</code>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={handleBrowse}
					disabled={disabled || selectDirectory.isPending}
				>
					Выбрать...
				</Button>
				{currentPath && (
					<Button
						variant="outline"
						size="sm"
						onClick={onReset}
						disabled={disabled}
					>
						Сбросить
					</Button>
				)}
			</div>
		</div>
	);
}
