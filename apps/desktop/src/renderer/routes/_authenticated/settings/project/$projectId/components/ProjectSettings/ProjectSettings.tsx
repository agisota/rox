import type { BranchPrefixMode } from "@rox/local-db";
import {
	resolveBranchPrefix,
	sanitizeSegment,
} from "@rox/shared/workspace-launch";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useImportAllWorktrees,
	useOpenExternalWorktree,
} from "renderer/react-query/workspaces";
import { ClickablePath } from "../../../../components/ClickablePath";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "../../../../components/WorktreeLocationPicker";
import { BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT } from "../../../../utils/branch-prefix";
import type { SettingItemId } from "../../../../utils/settings-search";
import {
	isItemVisible,
	SETTING_ITEM_ID,
} from "../../../../utils/settings-search";
import { ProjectSettingsHeader } from "../ProjectSettingsHeader";
import { ScriptsEditor } from "./components/ScriptsEditor";

const REPO_DEFAULT_BASE_BRANCH = "__repo_default__";
const BRANCH_PREFIX_MODE_LABELS_RU: Record<
	BranchPrefixMode | "default",
	string
> = {
	default: "Использовать глобальное значение",
	none: "Без префикса",
	github: "Имя пользователя GitHub",
	author: "Имя автора Git",
	custom: "Свой префикс",
};

export function SettingsSection({
	icon,
	title,
	description,
	children,
}: {
	icon?: ReactNode;
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div>
				<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
					{icon}
					{title}
				</h3>
				{description && (
					<p className="text-sm text-muted-foreground mt-0.5">{description}</p>
				)}
			</div>
			{children}
		</div>
	);
}

interface ProjectSettingsProps {
	projectId: string;
	visibleItems?: SettingItemId[] | null;
}

export function ProjectSettings({
	projectId,
	visibleItems,
}: ProjectSettingsProps) {
	const utils = electronTrpc.useUtils();
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const { data: branchData, isLoading: isBranchDataLoading } =
		electronTrpc.projects.getBranches.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery({
		id: projectId,
	});
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		project?.branchPrefixCustom ?? "",
	);
	const [selectedWorktreePath, setSelectedWorktreePath] = useState<
		string | null
	>(null);

	useEffect(() => {
		setCustomPrefixInput(project?.branchPrefixCustom ?? "");
	}, [project?.branchPrefixCustom]);

	const updateProject = electronTrpc.projects.update.useMutation({
		onError: (err) => {
			console.error("[project-settings/update] Failed to update:", err);
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const setProjectIcon = electronTrpc.projects.setProjectIcon.useMutation({
		onError: (err) => {
			console.error("[project-settings/setProjectIcon] Failed:", err);
			toast.error(err.message || "Не удалось обновить иконку проекта");
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleIconUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				setProjectIcon.mutate({ id: projectId, icon: dataUrl });
			};
			reader.readAsDataURL(file);

			// Reset input so the same file can be re-selected
			e.target.value = "";
		},
		[projectId, setProjectIcon],
	);

	const handleRemoveIcon = useCallback(() => {
		setProjectIcon.mutate({ id: projectId, icon: null });
	}, [projectId, setProjectIcon]);

	const handleBranchPrefixModeChange = (value: string) => {
		if (value === "default") {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: null,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		} else {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: value as BranchPrefixMode,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		}
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		updateProject.mutate({
			id: projectId,
			patch: {
				branchPrefixMode: "custom",
				branchPrefixCustom: sanitized || null,
			},
		});
	};

	const handleWorkspaceBaseBranchChange = (value: string) => {
		updateProject.mutate({
			id: projectId,
			patch: {
				workspaceBaseBranch: value === REPO_DEFAULT_BASE_BRANCH ? null : value,
			},
		});
	};

	const { data: globalWorktreeBaseDir } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const defaultWorktreePath = useDefaultWorktreePath();
	const globalPath = globalWorktreeBaseDir ?? defaultWorktreePath;

	const { data: externalWorktrees = [], isLoading: isExternalLoading } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	const importableExternalWorktrees = externalWorktrees.filter(
		(worktree) => !worktree.hasActiveWorkspace,
	);
	const importAllWorktrees = useImportAllWorktrees();
	const openExternalWorktree = useOpenExternalWorktree();

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(`Импортировано рабочих областей: ${result.imported}`);
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Не удалось импортировать worktree",
			);
		}
	};

	const handleImportWorktree = async (path: string, branch: string) => {
		toast.promise(
			openExternalWorktree.mutateAsync({
				projectId,
				worktreePath: path,
			}),
			{
				loading: "Импорт worktree...",
				success: `Импортирован ${branch}`,
				error: (err) =>
					err instanceof Error
						? err.message
						: "Не удалось импортировать worktree",
			},
		);
	};

	const getPreviewPrefix = (
		mode: BranchPrefixMode | "default",
	): string | null => {
		if (mode === "default") {
			return getPreviewPrefix(globalBranchPrefix?.mode ?? "none");
		}
		return (
			resolveBranchPrefix({
				mode,
				customPrefix: customPrefixInput,
				authorPrefix: gitAuthor?.prefix,
				githubUsername: gitInfo?.githubUsername,
			}) ||
			(mode === "author"
				? "author-name"
				: mode === "github"
					? "username"
					: null)
		);
	};

	if (!project) {
		return null;
	}

	const currentMode = project.branchPrefixMode ?? "default";
	const previewPrefix = getPreviewPrefix(currentMode);
	const repoDefaultBranch =
		branchData?.defaultBranch ?? project.defaultBranch ?? "main";
	const workspaceBaseBranchValue =
		project.workspaceBaseBranch ?? REPO_DEFAULT_BASE_BRANCH;
	const workspaceBaseBranchMissing =
		!isBranchDataLoading &&
		!!project.workspaceBaseBranch &&
		!!branchData &&
		!branchData.branches.some(
			(branch) => branch.name === project.workspaceBaseBranch,
		);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto select-text">
			<ProjectSettingsHeader title={project.name}>
				<ClickablePath
					path={project.mainRepoPath}
					className="text-xs text-muted-foreground"
				/>
			</ProjectSettingsHeader>

			<div className="space-y-8">
				<SettingsSection
					title="Префикс ветки"
					description={
						previewPrefix
							? `Предпросмотр: ${previewPrefix}/branch-name`
							: "Предпросмотр: branch-name"
					}
				>
					<div className="flex items-center justify-end">
						<div className="flex items-center gap-2">
							<Select
								value={currentMode}
								onValueChange={handleBranchPrefixModeChange}
								disabled={updateProject.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT) as [
											BranchPrefixMode | "default",
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{BRANCH_PREFIX_MODE_LABELS_RU[value] ?? label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{currentMode === "custom" && (
								<Input
									placeholder="Префикс"
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={updateProject.isPending}
								/>
							)}
						</div>
					</div>
				</SettingsSection>

				<SettingsSection
					title="Базовая ветка"
					description="База по умолчанию для новых рабочих областей. Можно переопределить при создании отдельной рабочей области."
				>
					<div className="flex items-center justify-end gap-4">
						<Select
							value={workspaceBaseBranchValue}
							onValueChange={handleWorkspaceBaseBranchChange}
							disabled={updateProject.isPending || isBranchDataLoading}
						>
							<SelectTrigger className="w-[260px]">
								{isBranchDataLoading ? (
									<span className="text-muted-foreground">Загрузка...</span>
								) : (
									<SelectValue />
								)}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={REPO_DEFAULT_BASE_BRANCH}>
									Использовать значение репозитория по умолчанию (
									{repoDefaultBranch})
								</SelectItem>
								{workspaceBaseBranchMissing && project.workspaceBaseBranch && (
									<SelectItem value={project.workspaceBaseBranch}>
										{project.workspaceBaseBranch} (отсутствует)
									</SelectItem>
								)}
								{(branchData?.branches ?? []).map((branch) => (
									<SelectItem key={branch.name} value={branch.name}>
										{branch.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{workspaceBaseBranchMissing && (
						<p className="text-xs text-destructive">
							Ветка "{project.workspaceBaseBranch}" больше не существует. Новые
							рабочие области будут использовать "{repoDefaultBranch}".
						</p>
					)}
				</SettingsSection>

				<SettingsSection title="Worktree">
					<WorktreeLocationPicker
						currentPath={project.worktreeBaseDir}
						defaultPathLabel={`Используется глобальное значение: ${globalPath}`}
						dialogTitle="Выберите расположение worktree для этого проекта"
						defaultBrowsePath={project.worktreeBaseDir ?? globalWorktreeBaseDir}
						disabled={updateProject.isPending}
						onSelect={(path) =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: path },
							})
						}
						onReset={() =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: null },
							})
						}
					/>

					{!isExternalLoading &&
						importableExternalWorktrees.length > 0 &&
						isItemVisible(
							SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES,
							visibleItems,
						) && (
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label className="text-sm font-medium">Импорт worktree</Label>
									<p className="text-xs text-muted-foreground">
										Внешних worktree на диске:{" "}
										{importableExternalWorktrees.length}.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Select
										value={selectedWorktreePath ?? "__all__"}
										onValueChange={(value) =>
											setSelectedWorktreePath(
												value === "__all__" ? null : value,
											)
										}
									>
										<SelectTrigger className="w-[220px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">
												Все worktree ({importableExternalWorktrees.length})
											</SelectItem>
											{importableExternalWorktrees.map((wt) => (
												<SelectItem key={wt.path} value={wt.path}>
													{wt.branch}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedWorktreePath ? (
										<Button
											size="sm"
											className="w-22"
											disabled={openExternalWorktree.isPending}
											onClick={() => {
												const wt = importableExternalWorktrees.find(
													(w) => w.path === selectedWorktreePath,
												);
												if (wt) {
													handleImportWorktree(wt.path, wt.branch);
													setSelectedWorktreePath(null);
												}
											}}
										>
											{openExternalWorktree.isPending
												? "Импорт..."
												: "Импортировать"}
										</Button>
									) : (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													size="sm"
													className="w-22"
													disabled={importAllWorktrees.isPending}
												>
													{importAllWorktrees.isPending
														? "Импорт..."
														: "Импортировать все"}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Импортировать все worktree
													</AlertDialogTitle>
													<AlertDialogDescription>
														Rox импортирует внешние worktree как рабочие
														области: {importableExternalWorktrees.length}.
														Каждый worktree на диске будет отслеживаться и
														появится в боковой панели. Файлы не будут изменены.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Отмена</AlertDialogCancel>
													<AlertDialogAction onClick={handleImportAll}>
														Импортировать все
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									)}
								</div>
							</div>
						)}
				</SettingsSection>

				<ScriptsEditor projectId={project.id} />

				<SettingsSection title="Внешний вид">
					<div className="flex items-center justify-between gap-4">
						<ColorSelector
							selectedColor={project.color}
							onSelectColor={(color) =>
								updateProject.mutate({
									id: projectId,
									patch: { color },
								})
							}
						/>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								{project.iconUrl && (
									<img
										src={project.iconUrl}
										alt="Иконка проекта"
										className="size-8 rounded object-cover border"
									/>
								)}
								<input
									ref={fileInputRef}
									type="file"
									accept="image/png,image/jpeg,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
									className="hidden"
									onChange={handleFileChange}
								/>
								<button
									type="button"
									onClick={handleIconUpload}
									disabled={setProjectIcon.isPending}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
										"hover:bg-muted transition-colors",
									)}
								>
									<LuImagePlus className="size-4" />
									{project.iconUrl ? "Заменить иконку" : "Загрузить иконку"}
								</button>
								{project.iconUrl && (
									<button
										type="button"
										onClick={handleRemoveIcon}
										disabled={setProjectIcon.isPending}
										className={cn(
											"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
											"hover:bg-destructive/10 text-destructive transition-colors",
										)}
									>
										<LuTrash2 className="size-4" />
										Удалить
									</button>
								)}
							</div>
							<div className="flex items-center gap-2">
								<Label className="text-sm text-muted-foreground">
									Скрыть изображение
								</Label>
								<Switch
									checked={project.hideImage ?? false}
									onCheckedChange={(checked) =>
										updateProject.mutate({
											id: projectId,
											patch: { hideImage: checked },
										})
									}
								/>
							</div>
						</div>
					</div>
				</SettingsSection>
			</div>
		</div>
	);
}
