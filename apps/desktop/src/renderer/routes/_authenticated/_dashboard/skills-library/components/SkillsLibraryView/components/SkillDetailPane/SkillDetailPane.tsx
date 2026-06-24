/**
 * Center pane: the skill detail editor (P0/MVP-3..8).
 *
 * Header with name/description/path + action row (Открыть в Finder, Удалить).
 * Body = resizable file tree | editor area. The editor area has Tabs:
 * "Редактор" (CodeMirror, language by extension, autosave + explicit save) and
 * "Просмотр" (streamdown, .md only). A SKILL.md frontmatter form sits above the
 * editor with two-way YAML sync. Binary / too-large files fall back to a
 * non-editable plaque with "Открыть в Finder".
 *
 * Transport is the existing local electron-tRPC `skillsLibrary` router; no new
 * procedures. "Удалить" requires a P1 backend procedure (skillsLibrary.remove)
 * that would touch the shared router, so it is rendered disabled with a tooltip
 * rather than faked.
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
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@rox/ui/resizable";
import { Skeleton } from "@rox/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rox/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@rox/ui/tooltip";
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
}

export function SkillDetailPane({ skillId, onSaved }: SkillDetailPaneProps) {
	const { data: detail, isLoading } = electronTrpc.skillsLibrary.get.useQuery({
		id: skillId,
	});
	const { revealInFinder } = useExternalActions();

	const [activePath, setActivePath] = useState<string | null>(null);
	const [view, setView] = useState<"editor" | "preview">("editor");

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

	// Markdown preview only makes sense for .md; force back to editor otherwise.
	useEffect(() => {
		if (!isMarkdown && view === "preview") setView("editor");
	}, [isMarkdown, view]);

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
				<TooltipProvider>
					<div className="flex shrink-0 items-center gap-1.5">
						<Button
							size="sm"
							variant="outline"
							onClick={() => revealInFinder(detail.absolutePath)}
						>
							<LuExternalLink className="size-4" />В Finder
						</Button>
						<Tooltip>
							<TooltipTrigger asChild>
								<span tabIndex={-1}>
									<Button size="sm" variant="ghost" disabled>
										<LuCopy className="size-4" />
										Дублировать
									</Button>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								Доступно после расширения локального API (P1)
							</TooltipContent>
						</Tooltip>
						<AlertDialog>
							<Tooltip>
								<TooltipTrigger asChild>
									<span tabIndex={-1}>
										<AlertDialogTrigger asChild>
											<Button
												size="sm"
												variant="ghost"
												disabled
												className="text-destructive hover:text-destructive"
											>
												<LuTrash2 className="size-4" />
												Удалить
											</Button>
										</AlertDialogTrigger>
									</span>
								</TooltipTrigger>
								<TooltipContent>
									Доступно после расширения локального API (P1)
								</TooltipContent>
							</Tooltip>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Удалить скилл «{detail.name}»?
									</AlertDialogTitle>
									<AlertDialogDescription>
										Действие необратимо.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Отмена</AlertDialogCancel>
									<AlertDialogAction disabled>Удалить</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</TooltipProvider>
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
						onSelect={(path) => {
							setActivePath(path);
							setView("editor");
						}}
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
		</div>
	);
}
