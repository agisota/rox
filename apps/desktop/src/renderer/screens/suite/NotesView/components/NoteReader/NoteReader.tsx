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
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";

/**
 * The note body the reader edits. Only the fields the reader needs — the
 * markdown body is the canonical wire format (notes.updateNote{markdown}); the
 * title is rename-able inline (notes.updateNote{title}).
 */
export interface NoteReaderNote {
	id: string;
	title: string;
	markdown?: string | null;
}

/** Mirrors the parent's debounced-autosave state so the reader can show it. */
export type SaveState = "idle" | "saving" | "saved";

export interface NoteReaderProps {
	/** The loaded note (id, title, markdown). Remount the reader per note via key. */
	note: NoteReaderNote;
	/** The live editor markdown (hydrated + kept by the parent NotesView). */
	markdown: string;
	/** Debounced change handler (parent owns the 800ms autosave + flush). */
	onMarkdownChange: (next: string) => void;
	/** Blur/explicit-save flush handler (parity with AutomationBody onSave). */
	onMarkdownSave: (next: string) => void;
	/** Commit a renamed title (trimmed, non-empty) via notes.updateNote{title}. */
	onRenameTitle: (nextTitle: string) => void;
	/** Delete this note entirely (notes.deleteNote). */
	onDelete: () => void;
	/** Reflects the autosave lifecycle for the indicator. */
	saveState: SaveState;
	/** Disable destructive/rename affordances while a mutation is in flight. */
	deleting?: boolean;
}

const EMPTY_NOTE_PLACEHOLDER = "Нажмите «/» для команд или начните писать…";

/**
 * Reader/editor pane for a single note (3rd Suite column). Notion-grade:
 *
 *  • inline TITLE RENAME — the header title is an editable field (pencil affordance
 *    / click), commit on Enter or blur, Esc reverts, empty reverts. Persisted via
 *    notes.updateNote{title} (the backing knowledge_documents row stays the system
 *    of record; the parent patches the list cache optimistically).
 *  • DELETE NOTE — a guarded AlertDialog (RU) calling notes.deleteNote.
 *  • a rich Tiptap MarkdownEditor body (slash menu, blocks, inline marks, code) with
 *    markdown as the wire format — the parent keeps the 800ms debounced autosave,
 *    per-note-id hydration guard, and unmount flush.
 *  • an autosave-state indicator that cross-fades 'Сохранение…' → 'Сохранено'
 *    (AnimatePresence), gated by prefers-reduced-motion.
 *  • a subtle per-note mount transition (8px upward fade) so note switches read as
 *    deliberate — also reduced-motion gated.
 *
 * Victor-Mono is scoped to code only (CodeBlockLowlight / inline `code` inside the
 * editor); the prose itself uses the app sans body font for a Notion feel.
 */
export function NoteReader({
	note,
	markdown,
	onMarkdownChange,
	onMarkdownSave,
	onRenameTitle,
	onDelete,
	saveState,
	deleting = false,
}: NoteReaderProps) {
	const reduceMotion = useReducedMotion();

	// --- inline title rename -------------------------------------------------
	const [renaming, setRenaming] = useState(false);
	const [titleDraft, setTitleDraft] = useState(note.title);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Keep the draft in sync when the note (or its server title) changes while we
	// are NOT actively editing, so an external rename / note switch is reflected.
	useEffect(() => {
		if (!renaming) setTitleDraft(note.title);
	}, [note.title, renaming]);

	const startRename = () => {
		setTitleDraft(note.title);
		setRenaming(true);
		// Focus + select on the next frame, once the input is mounted.
		requestAnimationFrame(() => {
			titleInputRef.current?.focus();
			titleInputRef.current?.select();
		});
	};

	const commitRename = () => {
		const next = titleDraft.trim();
		setRenaming(false);
		// Empty or unchanged → revert silently (no needless round-trip).
		if (!next || next === note.title) {
			setTitleDraft(note.title);
			return;
		}
		onRenameTitle(next);
	};

	const cancelRename = () => {
		setTitleDraft(note.title);
		setRenaming(false);
	};

	const bodyMotion = reduceMotion
		? {}
		: {
				initial: { opacity: 0, y: 8 },
				animate: { opacity: 1, y: 0 },
				transition: { duration: 0.18, ease: "easeOut" as const },
			};

	return (
		<div className="flex h-full flex-col">
			{/* Header: editable title + save-state + delete */}
			<div className="flex items-center justify-between gap-2 border-border border-b px-4 py-3">
				{renaming ? (
					<Input
						ref={titleInputRef}
						value={titleDraft}
						onChange={(e) => setTitleDraft(e.target.value)}
						onBlur={commitRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								commitRename();
							} else if (e.key === "Escape") {
								e.preventDefault();
								cancelRename();
							}
						}}
						aria-label="Переименовать заметку"
						maxLength={200}
						className="h-8 min-w-0 flex-1 font-semibold text-lg"
					/>
				) : (
					<button
						type="button"
						onClick={startRename}
						aria-label="Переименовать заметку"
						className="group flex min-w-0 flex-1 items-center gap-2 text-left"
					>
						<h2 className="cursor-text select-text truncate font-semibold text-lg">
							{note.title}
						</h2>
						<Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
					</button>
				)}

				<div className="flex shrink-0 items-center gap-1">
					<SaveStateIndicator state={saveState} reduceMotion={!!reduceMotion} />

					<AlertDialog>
						<Tooltip>
							<TooltipTrigger asChild>
								<AlertDialogTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Удалить заметку"
										disabled={deleting}
										className="size-7 text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="size-4" />
									</Button>
								</AlertDialogTrigger>
							</TooltipTrigger>
							<TooltipContent>Удалить заметку</TooltipContent>
						</Tooltip>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Удалить заметку?</AlertDialogTitle>
								<AlertDialogDescription>
									Заметка «{note.title}» будет удалена без возможности
									восстановления.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Отмена</AlertDialogCancel>
								<AlertDialogAction
									onClick={onDelete}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									Удалить
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			{/* Body: rich Tiptap markdown editor with a per-note mount transition. */}
			<motion.div
				key={note.id}
				{...bodyMotion}
				className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3"
			>
				<MarkdownEditor
					content={markdown}
					onChange={onMarkdownChange}
					onSave={onMarkdownSave}
					placeholder={EMPTY_NOTE_PLACEHOLDER}
					features={{ fileMention: false }}
					className="flex min-h-0 flex-1 flex-col"
					editorClassName="min-h-[55vh]"
				/>
			</motion.div>
		</div>
	);
}

/**
 * Autosave lifecycle pill. 'Сохранение…' while a write is in flight; on success a
 * brief 'Сохранено' check that fades out (the parent flips state back to idle).
 * prefers-reduced-motion drops the transforms but keeps the text swap.
 */
function SaveStateIndicator({
	state,
	reduceMotion,
}: {
	state: SaveState;
	reduceMotion: boolean;
}) {
	if (state === "idle") {
		// Keep layout stable (no width jump) while idle.
		return <span className="h-4 w-px" aria-hidden />;
	}

	const enter = reduceMotion
		? { initial: false }
		: {
				initial: { opacity: 0, y: -2 },
				animate: { opacity: 1, y: 0 },
				exit: { opacity: 0, y: -2 },
				transition: { duration: 0.15 },
			};

	return (
		<AnimatePresence mode="wait" initial={false}>
			{state === "saving" ? (
				<motion.span
					key="saving"
					{...enter}
					className="flex items-center gap-1 text-muted-foreground text-xs"
				>
					<Loader2 className="size-3 animate-spin" />
					Сохранение…
				</motion.span>
			) : (
				<motion.span
					key="saved"
					{...enter}
					className="flex items-center gap-1 text-muted-foreground text-xs"
				>
					<Check className="size-3 text-emerald-500" />
					Сохранено
				</motion.span>
			)}
		</AnimatePresence>
	);
}
