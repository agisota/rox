"use client";

import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useNotesActions } from "../../hooks/useNotesActions";

export interface NoteListProps {
	notebookId: string | null;
	selectedNoteId: string | null;
	onSelect: (noteId: string) => void;
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
		trpc.notebooks.listNotes.queryOptions({
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

	return (
		<div className="flex w-72 shrink-0 flex-col gap-2 border-r pr-3">
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
							<li key={note.id}>
								<button
									type="button"
									onClick={() => onSelect(note.id)}
									className={cn(
										"flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted",
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
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
