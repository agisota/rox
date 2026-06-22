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
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookText, FileText, Notebook, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { SuiteScreen } from "../components/SuiteScreen";

/**
 * Notes (Suite P2 surfaced in P0): a three-pane reader — notebooks on the left,
 * the selected notebook's notes in the middle, and the selected note's markdown
 * rendered on the right via the shared `MarkdownRenderer`. Supports creating a
 * notebook and creating a note (title + markdown body). List queries exclude the
 * (up to 500k) markdown column; the full body is fetched per-note via
 * `notebooks.getNote`.
 *
 * Cache-first (AGENTS.md rule 9): existing notebooks/notes render immediately.
 */
export function NotesView() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
	const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

	const [notebookDialogOpen, setNotebookDialogOpen] = useState(false);
	const [notebookName, setNotebookName] = useState("");

	const [noteDialogOpen, setNoteDialogOpen] = useState(false);
	const [noteTitle, setNoteTitle] = useState("");
	const [noteMarkdown, setNoteMarkdown] = useState("");

	const notebooksQuery = useQuery(
		trpc.notebooks.listNotebooks.queryOptions(undefined),
	);
	const notebooks = notebooksQuery.data ?? [];

	// Auto-select the first notebook once data arrives and nothing is selected.
	useEffect(() => {
		if (activeNotebookId === null && notebooks.length > 0) {
			setActiveNotebookId(notebooks[0]?.id ?? null);
		}
	}, [activeNotebookId, notebooks]);

	const notesQuery = useQuery({
		...trpc.notebooks.listNotes.queryOptions({
			notebookId: activeNotebookId ?? undefined,
		}),
		enabled: activeNotebookId !== null,
	});
	const notes = notesQuery.data ?? [];

	const noteQuery = useQuery({
		...trpc.notebooks.getNote.queryOptions({ noteId: activeNoteId ?? "" }),
		enabled: activeNoteId !== null,
	});

	const createNotebook = useMutation(
		trpc.notebooks.createNotebook.mutationOptions({
			onSuccess: async (row) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notebooks.listNotebooks.queryKey(undefined),
				});
				setNotebookDialogOpen(false);
				setNotebookName("");
				if (row) setActiveNotebookId(row.id);
			},
			onError: (error) => {
				logger.error("[NotesView] createNotebook failed", error);
				toast.error("Не удалось создать блокнот");
			},
		}),
	);

	const createNote = useMutation(
		trpc.notebooks.createNote.mutationOptions({
			onSuccess: async (row) => {
				if (activeNotebookId) {
					await queryClient.invalidateQueries({
						queryKey: trpc.notebooks.listNotes.queryKey({
							notebookId: activeNotebookId,
						}),
					});
				}
				setNoteDialogOpen(false);
				setNoteTitle("");
				setNoteMarkdown("");
				if (row) setActiveNoteId(row.id);
			},
			onError: (error) => {
				logger.error("[NotesView] createNote failed", error);
				toast.error("Не удалось создать заметку");
			},
		}),
	);

	return (
		<SuiteScreen
			title="Заметки"
			description="Блокноты и markdown-заметки"
			icon={BookText}
			className="max-w-6xl"
			actions={
				<Button onClick={() => setNotebookDialogOpen(true)}>
					<Plus className="size-4" /> Новый блокнот
				</Button>
			}
		>
			{notebooksQuery.isError && (
				<SuiteQueryError
					message={notebooksQuery.error.message}
					onRetry={() => notebooksQuery.refetch()}
				/>
			)}

			{notebooks.length === 0 && notebooksQuery.isLoading && (
				<div className="space-y-2">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			)}

			{notebooks.length === 0 && notebooksQuery.isSuccess && (
				<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-20 text-center">
					<Notebook className="mb-3 size-8 text-muted-foreground" />
					<span className="text-foreground text-sm">Блокнотов пока нет</span>
					<span className="mt-1 max-w-sm text-muted-foreground text-xs">
						Создайте первый блокнот, чтобы начать вести заметки.
					</span>
				</div>
			)}

			{notebooks.length > 0 && (
				<div className="grid h-[calc(100vh-220px)] min-h-96 grid-cols-[200px_240px_1fr] gap-3">
					{/* Notebooks column */}
					<div className="overflow-y-auto rounded-lg border border-border">
						{notebooks.map((notebook) => (
							<button
								key={notebook.id}
								type="button"
								onClick={() => {
									setActiveNotebookId(notebook.id);
									setActiveNoteId(null);
								}}
								className={cn(
									"flex w-full items-center gap-2 border-border border-b px-3 py-2.5 text-left text-sm last:border-b-0 transition-colors hover:bg-accent/40",
									notebook.id === activeNotebookId && "bg-accent",
								)}
							>
								<span className="shrink-0">{notebook.icon ?? "📓"}</span>
								<span className="truncate">{notebook.name}</span>
							</button>
						))}
					</div>

					{/* Notes column */}
					<div className="flex flex-col overflow-hidden rounded-lg border border-border">
						<div className="flex items-center justify-between border-border border-b px-2 py-1.5">
							<span className="text-muted-foreground text-xs">Заметки</span>
							<Button
								size="icon"
								variant="ghost"
								aria-label="Новая заметка"
								disabled={!activeNotebookId}
								onClick={() => setNoteDialogOpen(true)}
								className="size-6"
							>
								<Plus className="size-3.5" />
							</Button>
						</div>
						<div className="flex-1 overflow-y-auto">
							{notesQuery.isError && (
								<p className="cursor-text select-text px-3 py-3 text-destructive text-xs">
									{notesQuery.error.message}
								</p>
							)}
							{notes.length === 0 && notesQuery.isSuccess && (
								<p className="px-3 py-4 text-center text-muted-foreground text-xs">
									Нет заметок
								</p>
							)}
							{notes.map((note) => (
								<button
									key={note.id}
									type="button"
									onClick={() => setActiveNoteId(note.id)}
									className={cn(
										"flex w-full items-center gap-2 border-border border-b px-3 py-2 text-left text-sm last:border-b-0 transition-colors hover:bg-accent/40",
										note.id === activeNoteId && "bg-accent",
									)}
								>
									<FileText className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{note.title}</span>
								</button>
							))}
						</div>
					</div>

					{/* Note reader */}
					<div className="overflow-hidden rounded-lg border border-border">
						{activeNoteId === null ? (
							<div className="flex h-full flex-col items-center justify-center text-center">
								<FileText className="mb-3 size-8 text-muted-foreground" />
								<span className="text-muted-foreground text-sm">
									Выберите заметку
								</span>
							</div>
						) : noteQuery.isError ? (
							<p className="cursor-text select-text p-4 text-destructive text-sm">
								{noteQuery.error.message}
							</p>
						) : noteQuery.data ? (
							<div className="flex h-full flex-col">
								<div className="border-border border-b px-4 py-3">
									<h2 className="cursor-text select-text font-semibold text-lg">
										{noteQuery.data.title}
									</h2>
								</div>
								<div className="min-h-0 flex-1 px-4 py-3">
									<MarkdownRenderer
										content={noteQuery.data.markdown || "_Пустая заметка._"}
									/>
								</div>
							</div>
						) : (
							<div className="space-y-3 p-4">
								<Skeleton className="h-6 w-1/2" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						)}
					</div>
				</div>
			)}

			{/* Create notebook dialog */}
			<Dialog open={notebookDialogOpen} onOpenChange={setNotebookDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Новый блокнот</DialogTitle>
						<DialogDescription>
							Блокноты группируют ваши заметки.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="notebook-name">Название</Label>
						<Input
							id="notebook-name"
							value={notebookName}
							onChange={(e) => setNotebookName(e.target.value)}
							placeholder="Например: Идеи"
						/>
					</div>
					<DialogFooter>
						<Button
							disabled={!notebookName.trim() || createNotebook.isPending}
							onClick={() =>
								createNotebook.mutate({ name: notebookName.trim() })
							}
						>
							Создать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Create note dialog */}
			<Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
				<DialogContent className="max-h-[min(720px,calc(100dvh-2rem))] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Новая заметка</DialogTitle>
						<DialogDescription>
							Markdown поддерживается в теле заметки.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="note-title">Заголовок</Label>
							<Input
								id="note-title"
								value={noteTitle}
								onChange={(e) => setNoteTitle(e.target.value)}
								placeholder="Заголовок заметки"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="note-markdown">Текст (markdown)</Label>
							<Textarea
								id="note-markdown"
								value={noteMarkdown}
								onChange={(e) => setNoteMarkdown(e.target.value)}
								placeholder="# Заголовок&#10;&#10;Текст…"
								rows={10}
								className="font-mono text-sm"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							disabled={
								!activeNotebookId || !noteTitle.trim() || createNote.isPending
							}
							onClick={() => {
								if (!activeNotebookId) return;
								createNote.mutate({
									notebookId: activeNotebookId,
									title: noteTitle.trim(),
									markdown: noteMarkdown,
								});
							}}
						>
							Создать
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SuiteScreen>
	);
}
