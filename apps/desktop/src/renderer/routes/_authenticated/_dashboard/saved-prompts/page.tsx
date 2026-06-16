import { createFileRoute } from "@tanstack/react-router";
import { SavedPromptsView } from "./components/SavedPromptsView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/saved-prompts/",
)({
	component: SavedPromptsPage,
});

function SavedPromptsPage() {
	return <SavedPromptsView />;
}
