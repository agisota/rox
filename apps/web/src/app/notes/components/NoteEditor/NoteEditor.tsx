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
	const note = useQuery(trpc.notes.getNote.queryOptions({ noteId }));
	const actions = useNotesActions(notebookId);

	const [title, setTitle] = useState("");
	const [markdown, setMarkdown] = useState("");
	const lastSyncedId = useRef<string | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Buffer the most recent unsaved edit so the unmount cleanup can flush it
	// (the debounce would otherwise drop a pending change when the editor closes).
	const pendingRef = useRef<{ title?: string; markdown?: string } | null>(null);

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
		pendingRef.current = { ...pendingRef.current, ...next };
		if (saveTimer.current) clearTimeout(saveTimer.current);
		// Capture `noteId` at schedule time so a debounced save always targets the
		// note that was being edited, never whichever note is active when the timer
		// fires (defense-in-depth alongside the `key={noteId}` remount in N3).
		const targetNoteId = noteId;
		saveTimer.current = setTimeout(() => {
			const payload = pendingRef.current;
			pendingRef.current = null;
			if (payload)
				actions.updateNote.mutate({ noteId: targetNoteId, ...payload });
		}, AUTOSAVE_DELAY_MS);
	};

	// Keep the latest mutate fn/noteId for the unmount flush without re-arming the
	// effect (which would fire the cleanup on every keystroke).
	const flushRef = useRef<() => void>(() => {});
	flushRef.current = () => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		const payload = pendingRef.current;
		pendingRef.current = null;
		if (payload) actions.updateNote.mutate({ noteId, ...payload });
	};

	useEffect(() => {
		return () => {
			flushRef.current();
		};
	}, []);

	// Surface a brief "Сохранено" pill once a save lands, then fade it. Tracking
	// the previous pending state avoids showing it on the initial mount.
	const [justSaved, setJustSaved] = useState(false);
	const wasSaving = useRef(false);
	const isSaving = actions.updateNote.isPending;
	useEffect(() => {
		if (wasSaving.current && !isSaving && actions.updateNote.isSuccess) {
			setJustSaved(true);
			const timer = setTimeout(() => setJustSaved(false), 2000);
			return () => clearTimeout(timer);
		}
		wasSaving.current = isSaving;
	}, [isSaving, actions.updateNote.isSuccess]);

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
				<div className="flex items-center gap-2">
					<NotePresence noteId={noteId} />
					{isSaving ? (
						<span className="text-muted-foreground text-xs">Сохранение…</span>
					) : justSaved ? (
						<span className="text-muted-foreground text-xs">Сохранено</span>
					) : null}
				</div>
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
