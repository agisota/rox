"use client";

import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useNotesActions } from "../../hooks/useNotesActions";
import { NotePresence } from "./NotePresence";

const AUTOSAVE_DELAY_MS = 800;

export interface NoteEditorProps {
	noteId: string;
	notebookId: string | null;
}

/**
 * Markdown note editor. Cache-first (AGENTS.md #9): the last-known note renders
 * immediately; the skeleton only shows when there is genuinely no data yet.
 * Title + body changes autosave on a short debounce via `notebooks.updateNote`.
 * A publish switch toggles the public `/s/<slug>` link, and the collaborative
 * live-editing presence (`@rox/collab`, gated) mounts inline when available.
 */
export function NoteEditor({ noteId, notebookId }: NoteEditorProps) {
	const trpc = useTRPC();
	const note = useQuery(trpc.notebooks.getNote.queryOptions({ noteId }));
	const actions = useNotesActions(notebookId);

	const [title, setTitle] = useState("");
	const [markdown, setMarkdown] = useState("");
	const lastSyncedId = useRef<string | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Hydrate local editor state from the loaded note (once per note id), so
	// typing does not get clobbered by background refetches of the same note.
	useEffect(() => {
		if (note.data && lastSyncedId.current !== note.data.id) {
			setTitle(note.data.title);
			setMarkdown(note.data.markdown ?? "");
			lastSyncedId.current = note.data.id;
		}
	}, [note.data]);

	const scheduleSave = (next: { title?: string; markdown?: string }) => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			actions.updateNote.mutate({ noteId, ...next });
		}, AUTOSAVE_DELAY_MS);
	};

	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		};
	}, []);

	const data = note.data;
	const tags = (data?.tags ?? []) as string[];
	const isPublished = data?.isPublished ?? false;
	const publicUrl = data?.publicUrl ?? null;

	if (!data && note.isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-9 w-2/3" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (!data) {
		return (
			<div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
				Заметка не найдена.
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<NotePresence noteId={noteId} />
				<div className="flex items-center gap-2">
					<Label
						htmlFor="note-publish"
						className="text-muted-foreground text-xs"
					>
						Публичная ссылка
					</Label>
					<Switch
						id="note-publish"
						checked={isPublished}
						onCheckedChange={(checked) =>
							actions.setPublished.mutate({ noteId, isPublished: checked })
						}
					/>
				</div>
			</div>

			<Input
				aria-label="Заголовок заметки"
				value={title}
				onChange={(e) => {
					setTitle(e.target.value);
					scheduleSave({ title: e.target.value });
				}}
				placeholder="Без названия"
				className="border-0 px-0 font-semibold text-xl shadow-none focus-visible:ring-0"
			/>

			{tags.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{tags.map((tag) => (
						<Badge key={tag} variant="secondary">
							#{tag}
						</Badge>
					))}
				</div>
			) : null}

			<Textarea
				aria-label="Текст заметки в формате Markdown"
				value={markdown}
				onChange={(e) => {
					setMarkdown(e.target.value);
					scheduleSave({ markdown: e.target.value });
				}}
				placeholder="Пишите в Markdown…"
				className="min-h-[55vh] flex-1 resize-none font-mono text-sm leading-relaxed"
			/>

			{isPublished && publicUrl ? (
				<p className="text-muted-foreground text-xs">
					Доступна по ссылке:{" "}
					<a
						href={publicUrl}
						target="_blank"
						rel="noreferrer"
						className="underline"
					>
						{publicUrl}
					</a>
				</p>
			) : null}
		</div>
	);
}
