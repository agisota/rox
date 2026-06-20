"use client";

import { useState } from "react";
import { NotebookSidebar } from "../NotebookSidebar";
import { NoteEditor } from "../NoteEditor";
import { NoteList } from "../NoteList";

/**
 * Three-pane Notes workspace: notebook rail → note list → markdown editor.
 * Selection state lives here so the panes stay in sync; each pane reads its own
 * data from the `notebooks` tRPC router (cache-first). Selecting a notebook
 * clears the active note so the editor does not show a note from another book.
 */
export function NotesWorkspace() {
	const [notebookId, setNotebookId] = useState<string | null>(null);
	const [noteId, setNoteId] = useState<string | null>(null);

	return (
		<div className="flex h-[calc(100dvh-7rem)] gap-4">
			<NotebookSidebar
				selectedNotebookId={notebookId}
				onSelect={(id) => {
					setNotebookId(id);
					setNoteId(null);
				}}
			/>
			<NoteList
				notebookId={notebookId}
				selectedNoteId={noteId}
				onSelect={setNoteId}
			/>
			<section className="flex-1 overflow-y-auto">
				{noteId ? (
					<NoteEditor noteId={noteId} notebookId={notebookId} />
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
						Выберите заметку или создайте новую.
					</div>
				)}
			</section>
		</div>
	);
}
