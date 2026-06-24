import { splitHighlightedSnippet } from "@rox/shared/knowledge/notes-search";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BookText,
	ChevronDown,
	ChevronUp,
	FileText,
	FolderInput,
	Notebook,
	Plus,
	Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { SuiteQueryError } from "../components/SuiteQueryError";
import { SuiteScreen } from "../components/SuiteScreen";
import { NoteReader, type SaveState } from "./components/NoteReader";

/**
 * Render a `ts_headline` snippet with matched terms emphasized, splitting on the
 * safe sentinels. Text is ESCAPED React children (never `dangerouslySetInnerHTML`)
 * because the snippet is raw note markdown.
 */
function SnippetText({ snippet }: { snippet: string }) {
	const segments = splitHighlightedSnippet(snippet);
	if (segments.length === 0) return null;
	return (
		<span className="line-clamp-2 cursor-text select-text text-muted-foreground text-xs">
			{segments.map((seg, i) => {
				// Stable key: snippet segments are deterministic per render, so position
				// + content uniquely identifies a run.
				const key = `${i}:${seg.text}`;
				return seg.highlight ? (
					<mark
						key={key}
						className="bg-transparent font-medium text-foreground"
					>
						{seg.text}
					</mark>
				) : (
					<span key={key}>{seg.text}</span>
				);
			})}
		</span>
	);
}

/**
 * The server rejects MDX-unsafe note bodies via `assertNoteMarkdownSafe`, which
 * raises an `MdxSecurityError` (message prefixed `Knowledge MDX rejected:`)
 * mapped to a tRPC `BAD_REQUEST`. Detect that specific sentinel so an unsafe
 * paste gets a precise toast WITHOUT false-positiving on unrelated failures —
 * the editor buffer is kept either way.
 */
function isMarkdownSafetyError(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	return message.includes("Knowledge MDX rejected");
}

/**
 * Notes (Suite P0): a three-pane workspace — notebooks on the left, the selected
 * notebook's notes in the middle, and the selected note opened on the right in a
 * Notion-grade `NoteReader` (rich Tiptap `MarkdownEditor` body with slash menu /
 * blocks / inline marks, inline title rename, delete, and an autosave-state pill).
 * The body is persisted as markdown via `notes.updateNote` on an 800ms debounce
 * (+ blur and unmount flush). Supports creating a notebook and a note (title +
 * markdown body), renaming and deleting a note, and reordering/moving notes
 * between notebooks. List queries exclude the (up to 500k) markdown column; the
 * full body is fetched per-note via `notes.getNote`. The gated real-time
 * Yjs/Liveblocks co-editing peer still lives in `CollaborativeNoteEditor`.
 *
 * Cache-first (AGENTS.md rule 9): existing notebooks/notes render immediately;
 * title rename + delete patch the list cache optimistically.
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
		trpc.notes.listNotebooks.queryOptions(undefined),
	);
	const notebooks = notebooksQuery.data ?? [];

	// Auto-select the first notebook once data arrives and nothing is selected.
	useEffect(() => {
		if (activeNotebookId === null && notebooks.length > 0) {
			setActiveNotebookId(notebooks[0]?.id ?? null);
		}
	}, [activeNotebookId, notebooks]);

	const notesQuery = useQuery({
		...trpc.notes.listNotes.queryOptions({
			notebookId: activeNotebookId ?? undefined,
		}),
		enabled: activeNotebookId !== null,
	});
	const notes = notesQuery.data ?? [];

	// Server full-text search (D7 FTS), scoped to the active notebook to match the
	// list. Debounced so each keystroke doesn't fire a round-trip; cache-first so
	// prior results stay visible while a new query loads.
	const [searchInput, setSearchInput] = useState("");
	const debouncedQuery = useDebouncedValue(searchInput.trim(), 280);
	const isSearching = debouncedQuery.length > 0;
	const searchQuery = useQuery({
		...trpc.notes.searchNotes.queryOptions({
			query: debouncedQuery,
			notebookId: activeNotebookId ?? undefined,
		}),
		enabled: isSearching && activeNotebookId !== null,
	});
	const searchResults = searchQuery.data ?? [];

	const noteQuery = useQuery({
		...trpc.notes.getNote.queryOptions({ noteId: activeNoteId ?? "" }),
		enabled: activeNoteId !== null,
	});

	// --- note body editor (single-player baseline + collaborative-when-gated) ---
	// The reader pane is an editable markdown editor whose body autosaves through
	// `notes.updateNote` on a short debounce — the single-player baseline. When the
	// `collaboration.editor` experiment is open it is ALSO a Yjs/Liveblocks CRDT
	// peer (see CollaborativeNoteEditor), so two people editing the same note (web
	// or desktop) converge in real time. Mirrors the web `NoteEditor` autosave.
	const AUTOSAVE_DELAY_MS = 800;
	const [editorMarkdown, setEditorMarkdown] = useState("");
	const hydratedNoteId = useRef<string | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingMarkdownRef = useRef<string | null>(null);

	// Drive the reader's 'Сохранение… → Сохранено' indicator. We hold a short
	// 'saved' window after a successful body write, then fall back to idle.
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (savedTimer.current) clearTimeout(savedTimer.current);
		},
		[],
	);

	const updateNote = useMutation(
		trpc.notes.updateNote.mutationOptions({
			onMutate: (variables) => {
				// Only the body autosave should toggle the 'saving' pill (a title
				// rename has its own optimistic path and no body indicator).
				if (variables.markdown !== undefined) setSaveState("saving");
			},
			onSuccess: (_row, variables) => {
				if (variables.markdown === undefined) return;
				setSaveState("saved");
				if (savedTimer.current) clearTimeout(savedTimer.current);
				savedTimer.current = setTimeout(() => setSaveState("idle"), 1200);
			},
			onError: (error, variables) => {
				logger.error("[NotesView] updateNote failed", error);
				if (variables.markdown !== undefined) setSaveState("idle");
				// MDX-unsafe paste / serialization rejected by assertNoteMarkdownSafe:
				// surface a non-blocking, specific toast and KEEP the editor buffer
				// (the local editorMarkdown state is untouched) so nothing is lost.
				if (isMarkdownSafetyError(error)) {
					toast.error("Не удалось сохранить: недопустимый markdown");
				} else {
					toast.error("Не удалось сохранить заметку");
				}
			},
		}),
	);

	// Hydrate the editor from the loaded note. Re-hydrate when EITHER the note id
	// changes OR the editor is still empty while the server now has a non-empty body
	// and nothing is pending — this recovers the create→getNote race where the first
	// hydrate captured an empty/partial body and the textarea would otherwise stay
	// frozen empty (spec notes-tiptap quick-fix). The MarkdownEditor's own
	// focus-aware setContent + per-note remount still prevents background-refetch
	// clobber, so no in-progress typing is lost (cache-first, AGENTS.md #9).
	useEffect(() => {
		if (!noteQuery.data) return;
		const serverMarkdown = noteQuery.data.markdown ?? "";
		const isNewNote = hydratedNoteId.current !== noteQuery.data.id;
		const recoversEmpty =
			editorMarkdown === "" &&
			serverMarkdown !== "" &&
			pendingMarkdownRef.current === null;
		if (isNewNote || recoversEmpty) {
			setEditorMarkdown(serverMarkdown);
			hydratedNoteId.current = noteQuery.data.id;
		}
	}, [noteQuery.data, editorMarkdown]);

	// Keep the freshest mutate fn / note id for the debounced + unmount flush
	// without re-arming the effect on every keystroke.
	const flushSaveRef = useRef<() => void>(() => {});
	flushSaveRef.current = () => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		const payload = pendingMarkdownRef.current;
		pendingMarkdownRef.current = null;
		if (payload !== null && activeNoteId) {
			updateNote.mutate({ noteId: activeNoteId, markdown: payload });
		}
	};

	// Flush any pending edit when the editor unmounts (view close / note switch),
	// so the debounce never drops the last change.
	useEffect(() => {
		return () => flushSaveRef.current();
	}, []);

	const handleEditorChange = (next: string) => {
		setEditorMarkdown(next);
		pendingMarkdownRef.current = next;
		if (saveTimer.current) clearTimeout(saveTimer.current);
		// Capture the note id at schedule time so a debounced save always targets the
		// note that was being edited, never whichever note is active when it fires.
		const targetNoteId = activeNoteId;
		saveTimer.current = setTimeout(() => {
			const payload = pendingMarkdownRef.current;
			pendingMarkdownRef.current = null;
			if (payload !== null && targetNoteId) {
				updateNote.mutate({ noteId: targetNoteId, markdown: payload });
			}
		}, AUTOSAVE_DELAY_MS);
	};

	const createNotebook = useMutation(
		trpc.notes.createNotebook.mutationOptions({
			onSuccess: async (row) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notes.listNotebooks.queryKey(undefined),
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
		trpc.notes.createNote.mutationOptions({
			onSuccess: async (row) => {
				if (activeNotebookId) {
					await queryClient.invalidateQueries({
						queryKey: trpc.notes.listNotes.queryKey({
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

	// --- inline title rename + delete (per-note reader affordances) ----------
	// Both write through notes.updateNote{title} / notes.deleteNote (the backing
	// knowledge_documents row is the system of record) and patch the list cache
	// optimistically so the middle column reflects the change in the same frame
	// (cache-first, AGENTS.md #9). The reader's getNote cache is refreshed on
	// settle so the header title stays authoritative.
	const patchNoteTitleInList = (noteId: string, title: string) => {
		if (!activeNotebookId) return;
		const key = trpc.notes.listNotes.queryKey({ notebookId: activeNotebookId });
		queryClient.setQueryData(key, (prev: typeof notes | undefined) =>
			prev?.map((n) => (n.id === noteId ? { ...n, title } : n)),
		);
	};

	const renameNote = useMutation(
		trpc.notes.updateNote.mutationOptions({
			onMutate: ({ noteId, title }) => {
				if (title !== undefined) patchNoteTitleInList(noteId, title);
			},
			onSuccess: async (_row, { noteId }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.notes.getNote.queryKey({ noteId }),
				});
				if (activeNotebookId) {
					await queryClient.invalidateQueries({
						queryKey: trpc.notes.listNotes.queryKey({
							notebookId: activeNotebookId,
						}),
					});
				}
			},
			onError: (error) => {
				logger.error("[NotesView] renameNote failed", error);
				toast.error("Не удалось переименовать заметку");
				// Re-pull the list so the optimistic title is rolled back to truth.
				if (activeNotebookId) {
					queryClient.invalidateQueries({
						queryKey: trpc.notes.listNotes.queryKey({
							notebookId: activeNotebookId,
						}),
					});
				}
			},
		}),
	);

	const deleteNote = useMutation(
		trpc.notes.deleteNote.mutationOptions({
			onMutate: ({ noteId }) => {
				if (!activeNotebookId) return;
				const key = trpc.notes.listNotes.queryKey({
					notebookId: activeNotebookId,
				});
				queryClient.setQueryData(key, (prev: typeof notes | undefined) =>
					prev?.filter((n) => n.id !== noteId),
				);
				// If the deleted note was open, clear the reader selection.
				setActiveNoteId((current) => (current === noteId ? null : current));
			},
			onSuccess: async () => {
				toast.success("Заметка удалена");
				if (activeNotebookId) {
					await queryClient.invalidateQueries({
						queryKey: trpc.notes.listNotes.queryKey({
							notebookId: activeNotebookId,
						}),
					});
				}
				await queryClient.invalidateQueries({
					queryKey: trpc.notes.listNotebooks.queryKey(undefined),
				});
			},
			onError: (error) => {
				logger.error("[NotesView] deleteNote failed", error);
				toast.error("Не удалось удалить заметку");
				if (activeNotebookId) {
					queryClient.invalidateQueries({
						queryKey: trpc.notes.listNotes.queryKey({
							notebookId: activeNotebookId,
						}),
					});
				}
			},
		}),
	);

	// --- notebook membership (G): add / remove / reorder ---------------------
	// Edges (note_book_items) are keyed by the note's backing
	// knowledge_documents.id, so we pass `documentId = note.knowledgeDocumentId`.
	const invalidateNotesList = async () => {
		if (activeNotebookId) {
			await queryClient.invalidateQueries({
				queryKey: trpc.notes.listNotes.queryKey({
					notebookId: activeNotebookId,
				}),
			});
		}
		await queryClient.invalidateQueries({
			queryKey: trpc.notes.listNotebooks.queryKey(undefined),
		});
	};

	const addNoteToNotebook = useMutation(
		trpc.notes.addNoteToNotebook.mutationOptions({
			onSuccess: invalidateNotesList,
			onError: (error) => {
				logger.error("[NotesView] addNoteToNotebook failed", error);
				toast.error("Не удалось добавить заметку в блокнот");
			},
		}),
	);

	const removeNoteFromNotebook = useMutation(
		trpc.notes.removeNoteFromNotebook.mutationOptions({
			onSuccess: invalidateNotesList,
			onError: (error) => {
				logger.error("[NotesView] removeNoteFromNotebook failed", error);
				toast.error("Не удалось убрать заметку из блокнота");
			},
		}),
	);

	const reorderNotebookItems = useMutation(
		trpc.notes.reorderNotebookItems.mutationOptions({
			onSuccess: invalidateNotesList,
			onError: (error) => {
				logger.error("[NotesView] reorderNotebookItems failed", error);
				toast.error("Не удалось изменить порядок заметок");
			},
		}),
	);

	const handleMoveNote = (documentId: string, targetNoteBookId: string) => {
		if (!activeNotebookId) return;
		addNoteToNotebook.mutate({ noteBookId: targetNoteBookId, documentId });
		removeNoteFromNotebook.mutate({ noteBookId: activeNotebookId, documentId });
	};

	const handleRemoveNote = (documentId: string) => {
		if (!activeNotebookId) return;
		removeNoteFromNotebook.mutate({ noteBookId: activeNotebookId, documentId });
	};

	// Swap a row with its neighbour, then persist the FULL set of backing-doc ids
	// in the new order. Cache-first: optimistically apply before mutating.
	const handleReorderNote = (index: number, direction: -1 | 1) => {
		if (!activeNotebookId) return;
		const target = index + direction;
		if (target < 0 || target >= notes.length) return;
		const next = [...notes];
		const a = next[index];
		const b = next[target];
		if (!a || !b) return;
		next[index] = b;
		next[target] = a;

		const orderedDocumentIds = next
			.map((n) => n.knowledgeDocumentId)
			.filter((id): id is string => id != null);
		if (orderedDocumentIds.length !== next.length) return;

		queryClient.setQueryData(
			trpc.notes.listNotes.queryKey({ notebookId: activeNotebookId }),
			next,
		);
		reorderNotebookItems.mutate({
			noteBookId: activeNotebookId,
			orderedDocumentIds,
		});
	};

	const otherNotebooks = notebooks.filter((nb) => nb.id !== activeNotebookId);

	return (
		<SuiteScreen
			title="Заметки"
			description="Блокноты и markdown-заметки"
			icon={BookText}
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
						<div className="border-border border-b p-1.5">
							<div className="relative">
								<Search className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground" />
								<Input
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									placeholder="Поиск по заметкам"
									aria-label="Поиск по заметкам"
									disabled={!activeNotebookId}
									className="h-7 pl-7 text-sm"
								/>
							</div>
						</div>
						<div className="flex-1 overflow-y-auto">
							{isSearching ? (
								// Server FTS results. Cache-first (AGENTS.md rule 9): keep prior
								// results while loading; never blank to a spinner.
								searchQuery.isError ? (
									<p className="cursor-text select-text px-3 py-3 text-destructive text-xs">
										{searchQuery.error.message}
									</p>
								) : !searchQuery.data && searchQuery.isLoading ? (
									<p className="px-3 py-4 text-center text-muted-foreground text-xs">
										Поиск…
									</p>
								) : searchResults.length === 0 ? (
									<p className="px-3 py-4 text-center text-muted-foreground text-xs">
										Ничего не найдено
									</p>
								) : (
									searchResults.map((note) => (
										<button
											key={note.id}
											type="button"
											onClick={() => setActiveNoteId(note.id)}
											className={cn(
												"flex w-full flex-col gap-0.5 border-border border-b px-3 py-2 text-left last:border-b-0 transition-colors hover:bg-accent/40",
												note.id === activeNoteId && "bg-accent",
											)}
										>
											<span className="flex items-center gap-2 truncate text-sm">
												<FileText className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="truncate">{note.title}</span>
											</span>
											{note.snippet ? (
												<SnippetText snippet={note.snippet} />
											) : null}
										</button>
									))
								)
							) : (
								<>
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
									{notes.map((note, index) => {
										const documentId = note.knowledgeDocumentId;
										const canManage = documentId != null;
										return (
											<div
												key={note.id}
												className={cn(
													"group relative flex items-center border-border border-b last:border-b-0 transition-colors hover:bg-accent/40",
													note.id === activeNoteId && "bg-accent",
												)}
											>
												<button
													type="button"
													onClick={() => setActiveNoteId(note.id)}
													className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
												>
													<FileText className="size-3.5 shrink-0 text-muted-foreground" />
													<span className="truncate">{note.title}</span>
												</button>
												<div className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="size-6 text-muted-foreground disabled:opacity-30"
														aria-label="Выше"
														disabled={!canManage || index === 0}
														onClick={() => handleReorderNote(index, -1)}
													>
														<ChevronUp className="size-3.5" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="size-6 text-muted-foreground disabled:opacity-30"
														aria-label="Ниже"
														disabled={!canManage || index === notes.length - 1}
														onClick={() => handleReorderNote(index, 1)}
													>
														<ChevronDown className="size-3.5" />
													</Button>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="size-6 text-muted-foreground disabled:opacity-30"
																aria-label="Переместить в блокнот"
																disabled={!canManage}
															>
																<FolderInput className="size-3.5" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuLabel>
																Переместить в блокнот
															</DropdownMenuLabel>
															{otherNotebooks.length === 0 ? (
																<DropdownMenuItem disabled>
																	Других блокнотов нет
																</DropdownMenuItem>
															) : (
																otherNotebooks.map((nb) => (
																	<DropdownMenuItem
																		key={nb.id}
																		onSelect={() =>
																			documentId &&
																			handleMoveNote(documentId, nb.id)
																		}
																	>
																		<span className="truncate">
																			{nb.icon ? `${nb.icon} ` : ""}
																			{nb.name}
																		</span>
																	</DropdownMenuItem>
																))
															)}
															<DropdownMenuSeparator />
															<DropdownMenuItem
																variant="destructive"
																onSelect={() =>
																	documentId && handleRemoveNote(documentId)
																}
															>
																Убрать из этого блокнота
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>
										);
									})}
								</>
							)}
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
							<NoteReader
								key={noteQuery.data.id}
								note={noteQuery.data}
								markdown={editorMarkdown}
								saveState={saveState}
								deleting={deleteNote.isPending}
								onMarkdownChange={handleEditorChange}
								onMarkdownSave={(next) => {
									// Blur/explicit flush: cancel the debounce and write now, so a
									// click-away never loses the last edit (parity w/ AutomationBody).
									if (saveTimer.current) clearTimeout(saveTimer.current);
									pendingMarkdownRef.current = null;
									setEditorMarkdown(next);
									if (activeNoteId)
										updateNote.mutate({ noteId: activeNoteId, markdown: next });
								}}
								onRenameTitle={(nextTitle) => {
									if (activeNoteId)
										renameNote.mutate({
											noteId: activeNoteId,
											title: nextTitle,
										});
								}}
								onDelete={() => {
									if (activeNoteId) deleteNote.mutate({ noteId: activeNoteId });
								}}
							/>
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
