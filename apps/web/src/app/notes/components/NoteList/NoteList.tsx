"use client";

import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
 */
export function NoteList({
	notebookId,
	selectedNoteId,
	onSelect,
}: NoteListProps) {
	const trpc = useTRPC();
	const [filter, setFilter] = useState("");
	const actions = useNotesActions(notebookId);

	const notes = useQuery(
		trpc.notes.listNotes.queryOptions({
			notebookId: notebookId ?? undefined,
		}),
	);

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
					{filtered.map((note) => {
						const tags = (note.tags ?? []) as string[];
						return (
							<li key={note.id} className="group relative">
								<button
									type="button"
									onClick={() => onSelect(note.id)}
									className={cn(
										"flex w-full flex-col gap-0.5 rounded-md py-1.5 pr-9 pl-2 text-left hover:bg-muted",
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
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="-translate-y-1/2 absolute top-1/2 right-1 size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
									aria-label="Удалить заметку"
									onClick={() => handleDelete(note.id, note.title)}
								>
									<Trash2 className="size-4" />
								</Button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
