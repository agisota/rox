import { createFileRoute } from "@tanstack/react-router";
import { JournalView } from "renderer/screens/journal/JournalView";

export const Route = createFileRoute("/_authenticated/_dashboard/journal/")({
	component: JournalPage,
});

function JournalPage() {
	return <JournalView />;
}
