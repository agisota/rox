import { NotesWorkspace } from "./components/NotesWorkspace";

export const metadata = {
	title: "Заметки — Rox",
};

/**
 * Notes home: a three-pane workspace (notebooks → notes → markdown editor) with
 * collaborative live editing (gated) and per-note public sharing. The
 * interactive panes are client components that read from the `notebooks` tRPC
 * router (cache-first).
 */
export default function NotesPage() {
	return <NotesWorkspace />;
}
