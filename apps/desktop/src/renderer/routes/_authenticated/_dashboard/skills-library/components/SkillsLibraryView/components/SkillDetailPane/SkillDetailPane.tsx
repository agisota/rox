/**
 * Center pane: the skill detail editor (P0/MVP-3..8 + lifecycle, issue #560).
 *
 * Header with name/description/path + action row (Открыть в Finder, Дублировать,
 * Удалить). Body = resizable file tree | editor area. The editor area has Tabs:
 * "Редактор" (CodeMirror, language by extension, autosave + explicit save) and
 * "Просмотр" (streamdown, .md only). A SKILL.md frontmatter form sits above the
 * editor with two-way YAML sync. Binary / too-large files fall back to a
 * non-editable plaque with "Открыть в Finder".
 *
 * Lifecycle (issue #560): duplicate/delete skill and add/rename/delete file run
 * through the local `skillsLibrary` mutations. Switching files with unsaved
 * edits raises an "Несохранённые изменения" guard so edits are never lost
 * silently; the editor reports its dirty state up so the parent can guard skill
 * switches the same way.
 */

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
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@rox/ui/resizable";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import { useEffect, useMemo, useState } from "react";
import {
	LuCopy,
	LuExternalLink,
	LuEye,
	LuPencil,
	LuTrash2,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useExternalActions } from "../../../../hooks/useExternalActions";
import { useSkillFileEditor } from "../../../../hooks/useSkillFileEditor";
import { sourceLabel } from "../../../../lib/constants";
import { isEditableTextFile, isMarkdownFile } from "../../../../lib/file-kind";
import { SkillCodeEditor } from "./components/SkillCodeEditor";
import { SkillEditorFallback } from "./components/SkillEditorFallback";
import { SkillEditorFooter } from "./components/SkillEditorFooter";
import { SkillFileTree } from "./components/SkillFileTree";
import { SkillFrontmatterForm } from "./components/SkillFrontmatterForm";
import { SkillMarkdownPreview } from "./components/SkillMarkdownPreview";

interface SkillDetailPaneProps {
	skillId: string;
	onSaved?: () => void;
	/** Bubble up the active file's dirty state so the parent can guard switches. */
	onDirtyChange?: (isDirty: boolean) => void;
	/** Called after the skill is deleted so the parent can clear its selection. */
	onDeleted?: () => void;
	/** Called after a duplicate so the parent can jump to the new skill. */
	onDuplicated?: (newSkillId: string) => void;
}

/** A pending file switch held back while the editor has unsaved edits. */
type PendingSwitch = { kind: "file"; path: string };

export function SkillDetailPane({
	skillId,
	onSaved,
	onDirtyChange,
	onDeleted,
	onDuplicated,
}: SkillDetailPaneProps) {
	const { data: detail, isLoading } = electronTrpc.skillsLibrary.get.useQuery({
		id: skillId,
	});
	const utils = electronTrpc.useUtils();
	const { revealInFinder } = useExternalActions();

	const [activePath, setActivePath] = useState<string | null>(null);
	const [view, setView] = useState<"editor" | "preview">("editor");

	// Lifecycle dialog state.
	const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(
		null,
	);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [duplicateName, setDuplicateName] = useState<string | null>(null);
	const [newFilePath, setNewFilePath] = useState<string | null>(null);
	const [renameTarget, setRenameTarget] = useState<{
		from: string;
		to: string;
	} | null>(null);
	const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);

	// Default the active file to SKILL.md (or the first file) when detail loads.
	useEffect(() => {
		if (!detail) return;
		const preferred =
			detail.files.find((file) => file.relativePath === "SKILL.md") ??
			detail.files[0];
		setActivePath(preferred ? preferred.relativePath : null);
	}, [detail]);

	const activeFile = useMemo(
		() =>
			detail?.files.find((file) => file.relativePath === activePath) ?? null,
		[detail, activePath],
	);

	const editable = activePath !== null && isEditableTextFile(activePath);
	const isMarkdown = activePath !== null && isMarkdownFile(activePath);
	const isSkillMd = activePath === "SKILL.md";

	const editor = useSkillFileEditor({
		skillId,
		relativePath: activePath,
		editable,
		onSaved,
	});

	useEffect(() => {
		onDirtyChange?.(editor.isDirty);
	}, [editor.isDirty, onDirtyChange]);

	// Markdown preview only makes sense for .md; force back to editor otherwise.
	useEffect(() => {
		if (!isMarkdown && view === "preview") setView("editor");
	}, [isMarkdown, view]);

	const isClaude = skillId.startsWith("claude:");

	// --- Lifecycle mutations. --------------------------------------------------
	const refresh = () => {
		void utils.skillsLibrary.list.invalidate();
		void utils.skillsLibrary.get.invalidate({ id: skillId });
	};

	const deleteSkillMutation =
		electronTrpc.skillsLibrary.deleteSkill.useMutation({
			onSuccess: () => {
				toast.success("Скилл удалён");
				void utils.skillsLibrary.list.invalidate();
				onDeleted?.();
			},
			onError: (error) => toast.error(`Не удалось удалить: ${error.message}`),
		});

	const duplicateMutation =
		electronTrpc.skillsLibrary.duplicateSkill.useMutation({
			onSuccess: (data) => {
				toast.success(`Создана копия «${data.slug}»`);
				void utils.skillsLibrary.list.invalidate();
				onDuplicated?.(data.id);
			},
			onError: (error) =>
				toast.error(`Не удалось дублировать: ${error.message}`),
		});

	const createFileMutation = electronTrpc.skillsLibrary.createFile.useMutation({
		onSuccess: (data) => {
			toast.success("Файл создан");
			refresh();
			setActivePath(data.relativePath);
			setView("editor");
		},
		onError: (error) =>
			toast.error(`Не удалось создать файл: ${error.message}`),
	});

	const renameFileMutation = electronTrpc.skillsLibrary.renameFile.useMutation({
		onSuccess: (data) => {
			toast.success("Файл переименован");
			refresh();
			setActivePath(data.relativePath);
		},
		onError: (error) =>
			toast.error(`Не удалось переименовать: ${error.message}`),
	});

	const deleteFileMutation = electronTrpc.skillsLibrary.deleteFile.useMutation({
		onSuccess: (data) => {
			toast.success("Файл удалён");
			refresh();
			if (activePath === data.relativePath) setActivePath(null);
		},
		onError: (error) =>
			toast.error(`Не удалось удалить файл: ${error.message}`),
	});

	// --- File switching with a dirty guard. ------------------------------------
	const selectFile = (path: string) => {
		if (path === activePath) return;
		if (editor.isDirty) {
			setPendingSwitch({ kind: "file", path });
			return;
		}
		setActivePath(path);
		setView("editor");
	};

	const applyPendingSwitch = () => {
		if (!pendingSwitch) return;
		setActivePath(pendingSwitch.path);
		setView("editor");
		setPendingSwitch(null);
	};

	if (isLoading || !detail) {
		return (
			<div className="flex flex-col gap-3 p-6">
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-full max-w-md" />
				<Skeleton className="mt-4 h-64 w-full" />
			</div>
		);
	}

	const renderEditorArea = () => {
		if (activePath === null) {
			return (
				<div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
					Выберите файл слева, чтобы посмотреть или отредактировать его.
				</div>
			);
		}
		if (!editable) {
			return (
				<SkillEditorFallback
					kind="binary"
					sizeBytes={activeFile?.size}
					onReveal={() => revealInFinder(detail.absolutePath)}
				/>
			);
		}
		if (editor.readError === "too-large") {
			return (
				<SkillEditorFallback
					kind="too-large"
					sizeBytes={activeFile?.size}
					onReveal={() => revealInFinder(detail.absolutePath)}
				/>
			);
		}
		if (editor.readError) {
			return (
				<SkillEditorFallback
					kind="read-error"
					onReveal={() => revealInFinder(detail.absolutePath)}
				/>
			);
		}
		if (editor.isLoading) {
			return (
				<div className="flex flex-col gap-2 p-4">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			);
		}
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{isSkillMd && (
					<SkillFrontmatterForm
						value={editor.draft}
						onChange={editor.setDraft}
					/>
				)}
				<div className="min-h-0 flex-1 overflow-hidden">
					<SkillCodeEditor
						relativePath={activePath}
						value={editor.draft}
						onChange={editor.setDraft}
					/>
				</div>
			</div>
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h2 className="truncate text-base font-semibold text-foreground">
							{detail.name}
						</h2>
						<Badge variant="outline" className="font-mono text-[10px]">
							{sourceLabel(detail.source)}
						</Badge>
					</div>
					{detail.description && (
						<p className="mt-0.5 line-clamp-2 select-text text-sm text-muted-foreground">
							{detail.description}
						</p>
					)}
					<button
						type="button"
						onClick={() => revealInFinder(detail.absolutePath)}
						title="Открыть в Finder"
						className="mt-1 max-w-full truncate select-text font-mono text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
					>
						{detail.absolutePath}
					</button>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<Button
						size="sm"
						variant="outline"
						onClick={() => revealInFinder(detail.absolutePath)}
					>
						<LuExternalLink className="size-4" />В Finder
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setDuplicateName(`${detail.slug}-copy`)}
						disabled={duplicateMutation.isPending}
					>
						<LuCopy className="size-4" />
						Дублировать
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="text-destructive hover:text-destructive"
						onClick={() => setDeleteOpen(true)}
						disabled={!isClaude || deleteSkillMutation.isPending}
						title={
							isClaude
								? undefined
								: "Скиллы из ~/.agents доступны только для чтения"
						}
					>
						<LuTrash2 className="size-4" />
						Удалить
					</Button>
				</div>
			</header>

			<ResizablePanelGroup
				direction="horizontal"
				autoSaveId="rox-skill-detail"
				className="min-h-0 flex-1"
			>
				<ResizablePanel
					defaultSize={26}
					minSize={16}
					maxSize={40}
					className="min-w-[10rem]"
				>
					<SkillFileTree
						files={detail.files}
						activePath={activePath}
						onSelect={selectFile}
						canEdit={isClaude}
						onAddFile={() => setNewFilePath("")}
						onRenameFile={(path) => setRenameTarget({ from: path, to: path })}
						onDeleteFile={(path) => setDeleteFileTarget(path)}
					/>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel defaultSize={74} minSize={40}>
					<div className="flex h-full min-h-0 flex-col">
						<Tabs
							value={view}
							onValueChange={(next) => setView(next as "editor" | "preview")}
							className="flex min-h-0 flex-1 flex-col gap-0"
						>
							<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
								<TabsList className="h-8">
									<TabsTrigger value="editor" className="text-xs">
										<LuPencil className="size-3.5" />
										Редактор
									</TabsTrigger>
									<TabsTrigger
										value="preview"
										className="text-xs"
										disabled={!isMarkdown}
									>
										<LuEye className="size-3.5" />
										Просмотр
									</TabsTrigger>
								</TabsList>
								<span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
									{activePath ?? "Файл не выбран"}
								</span>
							</div>
							<TabsContent
								value="editor"
								className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
							>
								{renderEditorArea()}
							</TabsContent>
							<TabsContent
								value="preview"
								className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
							>
								{isMarkdown && <SkillMarkdownPreview content={editor.draft} />}
							</TabsContent>
						</Tabs>
						{view === "editor" && editable && !editor.readError && (
							<SkillEditorFooter
								isDirty={editor.isDirty}
								isSaving={editor.isSaving}
								onSave={editor.save}
							/>
						)}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>

			{/* Unsaved-edits guard when switching files. */}
			<AlertDialog
				open={pendingSwitch !== null}
				onOpenChange={(open) => {
					if (!open) setPendingSwitch(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Несохранённые изменения</AlertDialogTitle>
						<AlertDialogDescription>
							В текущем файле есть несохранённые правки. Что сделать перед
							переключением?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						<Button
							variant="outline"
							onClick={() => {
								applyPendingSwitch();
							}}
						>
							Продолжить без сохранения
						</Button>
						<AlertDialogAction
							onClick={() => {
								editor.save();
								applyPendingSwitch();
							}}
						>
							Сохранить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Delete skill confirm. */}
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Удалить скилл «{detail.name}»?</AlertDialogTitle>
						<AlertDialogDescription>
							Каталог скилла будет удалён без возможности восстановления.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								deleteSkillMutation.mutate({ id: skillId });
								setDeleteOpen(false);
							}}
						>
							Удалить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Duplicate skill name prompt. */}
			<Dialog
				open={duplicateName !== null}
				onOpenChange={(open) => {
					if (!open) setDuplicateName(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Дублировать скилл</DialogTitle>
						<DialogDescription>
							Введите имя для копии. Она будет создана в ~/.claude/skills.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-duplicate-name">Имя нового скилла</Label>
						<Input
							id="skill-duplicate-name"
							value={duplicateName ?? ""}
							onChange={(e) => setDuplicateName(e.target.value)}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDuplicateName(null)}>
							Отмена
						</Button>
						<Button
							disabled={!duplicateName?.trim() || duplicateMutation.isPending}
							onClick={() => {
								if (!duplicateName?.trim()) return;
								duplicateMutation.mutate({
									id: skillId,
									newName: duplicateName.trim(),
								});
								setDuplicateName(null);
							}}
						>
							Дублировать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* New file prompt. */}
			<Dialog
				open={newFilePath !== null}
				onOpenChange={(open) => {
					if (!open) setNewFilePath(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Новый файл</DialogTitle>
						<DialogDescription>
							Путь относительно каталога скилла (например,
							`references/notes.md`).
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-new-file">Путь файла</Label>
						<Input
							id="skill-new-file"
							value={newFilePath ?? ""}
							onChange={(e) => setNewFilePath(e.target.value)}
							placeholder="example.md"
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setNewFilePath(null)}>
							Отмена
						</Button>
						<Button
							disabled={!newFilePath?.trim() || createFileMutation.isPending}
							onClick={() => {
								if (!newFilePath?.trim()) return;
								createFileMutation.mutate({
									id: skillId,
									relativePath: newFilePath.trim(),
								});
								setNewFilePath(null);
							}}
						>
							Создать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename file prompt. */}
			<Dialog
				open={renameTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRenameTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Переименовать файл</DialogTitle>
						<DialogDescription>
							Новый путь относительно каталога скилла.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="skill-rename-file">Новый путь</Label>
						<Input
							id="skill-rename-file"
							value={renameTarget?.to ?? ""}
							onChange={(e) =>
								setRenameTarget((prev) =>
									prev ? { ...prev, to: e.target.value } : prev,
								)
							}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRenameTarget(null)}>
							Отмена
						</Button>
						<Button
							disabled={
								!renameTarget?.to.trim() ||
								renameTarget.to.trim() === renameTarget.from ||
								renameFileMutation.isPending
							}
							onClick={() => {
								if (!renameTarget) return;
								renameFileMutation.mutate({
									id: skillId,
									from: renameTarget.from,
									to: renameTarget.to.trim(),
								});
								setRenameTarget(null);
							}}
						>
							Переименовать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete file confirm. */}
			<AlertDialog
				open={deleteFileTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteFileTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Удалить файл?</AlertDialogTitle>
						<AlertDialogDescription>
							Файл «{deleteFileTarget}» будет удалён без возможности
							восстановления.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (deleteFileTarget) {
									deleteFileMutation.mutate({
										id: skillId,
										relativePath: deleteFileTarget,
									});
								}
								setDeleteFileTarget(null);
							}}
						>
							Удалить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
