import { createFileRoute } from "@tanstack/react-router";
import { NotesView } from "renderer/screens/suite/NotesView";

export const Route = createFileRoute("/_authenticated/_dashboard/notes/")({
	component: NotesPage,
});

function NotesPage() {
	return <NotesView />;
}
