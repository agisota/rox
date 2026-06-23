"use client";

import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	ChevronUp,
	FolderInput,
	Plus,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useNotesActions } from "../../hooks/useNotesActions";

export interface NoteListProps {
	notebookId: string | null;
	selectedNoteId: string | null;
	onSelect: (noteId: string | null) => void;
}

/**
 * Note list for the active notebook with a free-text + tag filter box. Cache-
 * first: renders the last-known notes immediately; the skeleton/empty states
 * apply only when there is genuinely no data yet.
 *
 * Membership controls (G): each row exposes a "move to notebook" menu (add the
 * note's backing document to another notebook / remove it from this one) and
 * up/down reorder buttons. Edges are keyed by `knowledgeDocumentId`, so rows
 * without a backing doc (legacy/detached) have these controls disabled.
 */
export function NoteList({
	notebookId,
	selectedNoteId,
	onSelect,
}: NoteListProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState("");
	const actions = useNotesActions(notebookId);

	const notes = useQuery(
		trpc.notes.listNotes.queryOptions({
			notebookId: notebookId ?? undefined,
		}),
	);

	// Notebooks power the "move to" menu. Cache-first: render whatever is cached.
	const notebooks = useQuery(trpc.notes.listNotebooks.queryOptions());

	const data = notes.data ?? [];

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return data;
		return data.filter((note) => {
			const tags = (note.tags ?? []) as string[];
			return (
				note.title.toLowerCase().includes(q) ||
				tags.some((tag) => tag.toLowerCase().includes(q))
			);
		});
	}, [data, filter]);

	// Whether reorder is meaningful: only when showing the full (unfiltered) list
	// of a concrete notebook with 2+ rows. Reordering a filtered view would send a
	// partial set and be rejected server-side.
	const canReorder = notebookId != null && filter.trim() === "";

	const handleCreate = () => {
		if (!notebookId) return;
		actions.createNote.mutate(
			{ notebookId, title: "Новая заметка" },
			{ onSuccess: (row) => row?.id && onSelect(row.id) },
		);
	};

	const handleDelete = (id: string, noteTitle: string) => {
		if (!window.confirm(`Удалить заметку «${noteTitle}»?`)) return;
		actions.deleteNote.mutate(
			{ noteId: id },
			{
				onSuccess: () => {
					if (selectedNoteId === id) onSelect(null);
				},
			},
		);
	};

	const handleMove = (documentId: string, targetNoteBookId: string) => {
		if (!notebookId) return;
		actions.addNoteToNotebook.mutate({
			noteBookId: targetNoteBookId,
			documentId,
		});
		// Also drop the edge from the current notebook so "move" relocates rather
		// than duplicating membership.
		actions.removeNoteFromNotebook.mutate({
			noteBookId: notebookId,
			documentId,
		});
	};

	const handleRemove = (documentId: string) => {
		if (!notebookId) return;
		actions.removeNoteFromNotebook.mutate({
			noteBookId: notebookId,
			documentId,
		});
	};

	// Reorder by swapping a row with its neighbour, then persist the full set of
	// backing-document ids in the new order (optimistic, cache-first).
	const handleReorder = (index: number, direction: -1 | 1) => {
		if (!notebookId) return;
		const target = index + direction;
		if (target < 0 || target >= filtered.length) return;

		const next = [...filtered];
		const a = next[index];
		const b = next[target];
		if (!a || !b) return;
		next[index] = b;
		next[target] = a;

		const orderedDocumentIds = next
			.map((n) => n.knowledgeDocumentId)
			.filter((id): id is string => id != null);
		// All rows must have a backing doc for the set to match the notebook's edges.
		if (orderedDocumentIds.length !== next.length) return;

		// Optimistically apply the new order so existing rows never blank.
		queryClient.setQueryData(
			trpc.notes.listNotes.queryKey({ notebookId: notebookId ?? undefined }),
			next,
		);
		actions.reorderNotebookItems.mutate({
			noteBookId: notebookId,
			orderedDocumentIds,
		});
	};

	const otherNotebooks = (notebooks.data ?? []).filter(
		(nb) => nb.id !== notebookId,
	);

	return (
		<div className="flex w-full shrink-0 flex-col gap-2 border-b pb-3 md:w-72 md:border-r md:border-b-0 md:pr-3 md:pb-0">
			<div className="flex items-center gap-2">
				<Input
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder="Поиск по названию или тегу"
					className="h-8"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					aria-label="Новая заметка"
					onClick={handleCreate}
					disabled={!notebookId}
				>
					<Plus className="size-4" />
				</Button>
			</div>

			{!notes.data && notes.isLoading ? (
				<div className="space-y-2 pt-1">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			) : !notebookId ? (
				<p className="px-1 py-3 text-muted-foreground text-xs">
					Выберите блокнот слева.
				</p>
			) : filtered.length === 0 ? (
				<p className="px-1 py-3 text-muted-foreground text-xs">
					Заметок нет. Создайте первую.
				</p>
			) : (
				<ul className="flex flex-col gap-0.5">
					{filtered.map((note, index) => {
						const tags = (note.tags ?? []) as string[];
						const documentId = note.knowledgeDocumentId;
						const canManage = documentId != null;
						return (
							<li key={note.id} className="group relative">
								<button
									type="button"
									onClick={() => onSelect(note.id)}
									className={cn(
										"flex w-full flex-col gap-0.5 rounded-md py-1.5 pr-24 pl-2 text-left hover:bg-muted",
										selectedNoteId === note.id && "bg-muted",
									)}
								>
									<span className="flex items-center gap-1.5 truncate font-medium text-sm">
										{note.isPublished ? (
											<span
												className="size-1.5 rounded-full bg-emerald-500"
												title="Опубликована"
											/>
										) : null}
										{note.title}
									</span>
									{tags.length > 0 ? (
										<span className="truncate text-muted-foreground text-xs">
											{tags.map((tag) => `#${tag}`).join(" ")}
										</span>
									) : null}
								</button>
								<div className="-translate-y-1/2 absolute top-1/2 right-1 flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground disabled:opacity-30"
										aria-label="Выше"
										disabled={!canReorder || !canManage || index === 0}
										onClick={() => handleReorder(index, -1)}
									>
										<ChevronUp className="size-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground disabled:opacity-30"
										aria-label="Ниже"
										disabled={
											!canReorder || !canManage || index === filtered.length - 1
										}
										onClick={() => handleReorder(index, 1)}
									>
										<ChevronDown className="size-4" />
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground disabled:opacity-30"
												aria-label="Переместить в блокнот"
												disabled={!canManage}
											>
												<FolderInput className="size-4" />
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
															documentId && handleMove(documentId, nb.id)
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
												onSelect={() => documentId && handleRemove(documentId)}
											>
												Убрать из этого блокнота
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground transition-opacity hover:text-destructive"
										aria-label="Удалить заметку"
										onClick={() => handleDelete(note.id, note.title)}
									>
										<Trash2 className="size-4" />
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
