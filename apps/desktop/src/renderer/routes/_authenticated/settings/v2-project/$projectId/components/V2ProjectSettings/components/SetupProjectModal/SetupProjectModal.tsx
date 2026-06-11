import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { useEffect, useState } from "react";
import { LuFolderOpen, LuLoaderCircle } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AnimatedDialogContent } from "renderer/motion";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";

type SetupMode = "clone" | "import";

interface SetupProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	hostUrl: string | null;
	hostName: string;
	repoCloneUrl: string | null;
	isRemoteTarget: boolean;
	onChanged?: () => void;
	onConflict: (conflict: { id: string; name: string }) => void;
}

export function SetupProjectModal({
	open,
	onOpenChange,
	projectId,
	hostUrl,
	hostName,
	repoCloneUrl,
	isRemoteTarget,
	onChanged,
	onConflict,
}: SetupProjectModalProps) {
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();

	const [mode, setMode] = useState<SetupMode>(
		repoCloneUrl ? "clone" : "import",
	);
	const [parentDir, setParentDir] = useState("");
	const [importPath, setImportPath] = useState("");
	const [working, setWorking] = useState(false);
	const [browseTarget, setBrowseTarget] = useState<
		"parentDir" | "importPath" | null
	>(null);

	useEffect(() => {
		if (!open) return;
		setMode(repoCloneUrl ? "clone" : "import");
	}, [open, repoCloneUrl]);

	const reset = () => {
		setParentDir("");
		setImportPath("");
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const browseFor = async (
		title: string,
		target: "parentDir" | "importPath",
	) => {
		try {
			const result = await selectDirectory.mutateAsync({ title });
			if (result.canceled || !result.path) return;
			if (target === "parentDir") setParentDir(result.path);
			else setImportPath(result.path);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		}
	};

	const runClone = async () => {
		if (!hostUrl) {
			toast.error(`Хост недоступен: ${hostName}`);
			return;
		}
		const trimmed = parentDir.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? `Введите родительскую папку на ${hostName}`
					: "Выберите родительскую папку",
			);
			return;
		}
		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.project.setup.mutate({
				projectId,
				mode: { kind: "clone", parentDir: trimmed },
			});
			toast.success(`Клонировано в ${result.repoPath}`);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setWorking(false);
		}
	};

	const runImport = async () => {
		if (!hostUrl) {
			toast.error(`Хост недоступен: ${hostName}`);
			return;
		}
		const trimmed = importPath.trim();
		if (!trimmed) {
			toast.error(
				isRemoteTarget
					? `Введите путь на ${hostName}`
					: "Выберите расположение проекта",
			);
			return;
		}
		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			const precheck = await client.project.findBackfillConflict.query({
				projectId,
				repoPath: trimmed,
			});
			if (precheck.conflict) {
				onConflict(precheck.conflict);
				onOpenChange(false);
				return;
			}
			const result = await client.project.setup.mutate({
				projectId,
				mode: { kind: "import", repoPath: trimmed, allowRelocate: false },
			});
			toast.success(`Проект запущен в ${result.repoPath}`);
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, projectId);
			} else {
				ensureProjectInSidebar(projectId);
			}
			onChanged?.();
			reset();
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setWorking(false);
		}
	};

	const submit = mode === "clone" ? runClone : runImport;
	const submitLabel = mode === "clone" ? "Клонировать" : "Импортировать";
	const cloneDisabled = !repoCloneUrl;

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange} modal>
				<AnimatedDialogContent
					open={open}
					showCloseButton
					className="bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[480px] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg"
					style={{ y: "-50%" }}
				>
					<DialogHeader>
						<DialogTitle>Запуск проекта на {hostName}</DialogTitle>
						<DialogDescription>
							Клонируйте репозиторий или импортируйте существующую папку на
							хосте.
						</DialogDescription>
					</DialogHeader>

					<Tabs
						value={mode}
						onValueChange={(value) => setMode(value as SetupMode)}
					>
						<TabsList className="w-full">
							<TabsTrigger
								value="clone"
								disabled={cloneDisabled}
								className="flex-1"
							>
								Клонировать
							</TabsTrigger>
							<TabsTrigger value="import" className="flex-1">
								Импорт папки
							</TabsTrigger>
						</TabsList>

						<TabsContent value="clone" className="mt-4 space-y-3">
							{cloneDisabled ? (
								<p className="text-sm text-muted-foreground">
									Сначала привяжите GitHub-репозиторий к проекту, чтобы включить
									клонирование.
								</p>
							) : (
								<>
									{repoCloneUrl && (
										<div className="flex flex-col gap-1">
											<Label className="text-xs">Репозиторий</Label>
											<p className="font-mono text-xs text-muted-foreground select-text cursor-text break-all">
												{repoCloneUrl}
											</p>
										</div>
									)}
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="setup-parent-dir" className="text-xs">
											Родительская папка
											{isRemoteTarget ? ` на ${hostName}` : ""}
										</Label>
										<div className="flex gap-1.5">
											<Input
												id="setup-parent-dir"
												value={parentDir}
												onChange={(e) => setParentDir(e.target.value)}
												placeholder={
													isRemoteTarget
														? "/home/user/projects"
														: "Выберите папку…"
												}
												disabled={working}
												className="flex-1 font-mono text-sm"
												onKeyDown={(e) => {
													if (e.key === "Enter" && !working) void runClone();
												}}
											/>
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => {
													if (isRemoteTarget) {
														setBrowseTarget("parentDir");
													} else {
														void browseFor(
															"Выберите родительскую папку для клонирования",
															"parentDir",
														);
													}
												}}
												disabled={working || selectDirectory.isPending}
												className="shrink-0"
												aria-label="Выбрать папку"
											>
												<LuFolderOpen className="size-4" />
											</Button>
										</div>
									</div>
								</>
							)}
						</TabsContent>

						<TabsContent value="import" className="mt-4 space-y-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-import-path" className="text-xs">
									Путь к существующему репозиторию
									{isRemoteTarget ? ` на ${hostName}` : ""}
								</Label>
								<div className="flex gap-1.5">
									<Input
										id="setup-import-path"
										value={importPath}
										onChange={(e) => setImportPath(e.target.value)}
										placeholder={
											isRemoteTarget
												? "/home/user/projects/my-repo"
												: "Выберите папку…"
										}
										disabled={working}
										className="flex-1 font-mono text-sm"
										onKeyDown={(e) => {
											if (e.key === "Enter" && !working) void runImport();
										}}
									/>
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => {
											if (isRemoteTarget) {
												setBrowseTarget("importPath");
											} else {
												void browseFor(
													"Выберите расположение проекта",
													"importPath",
												);
											}
										}}
										disabled={working || selectDirectory.isPending}
										className="shrink-0"
										aria-label="Выбрать папку"
									>
										<LuFolderOpen className="size-4" />
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							Отмена
						</Button>
						<Button
							type="button"
							onClick={() => void submit()}
							disabled={
								working || !hostUrl || (mode === "clone" && cloneDisabled)
							}
						>
							{working ? (
								<>
									<LuLoaderCircle className="size-4 animate-spin" />
									{submitLabel}…
								</>
							) : (
								submitLabel
							)}
						</Button>
					</DialogFooter>
				</AnimatedDialogContent>
			</Dialog>

			<RemotePathPicker
				open={browseTarget !== null}
				onOpenChange={(next) => {
					if (!next) setBrowseTarget(null);
				}}
				hostUrl={hostUrl}
				hostName={hostName}
				initialPath={
					browseTarget === "parentDir"
						? parentDir || undefined
						: browseTarget === "importPath"
							? importPath || undefined
							: undefined
				}
				title={
					browseTarget === "parentDir"
						? "Выберите родительскую папку"
						: "Выберите папку существующего репозитория"
				}
				confirmLabel={
					browseTarget === "parentDir"
						? "Использовать эту папку"
						: "Использовать этот репозиторий"
				}
				onPick={(path) => {
					if (browseTarget === "parentDir") setParentDir(path);
					else if (browseTarget === "importPath") setImportPath(path);
				}}
			/>
		</>
	);
}
