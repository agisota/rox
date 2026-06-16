import { createFileRoute } from "@tanstack/react-router";
import { SkillsLibraryView } from "./components/SkillsLibraryView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/skills-library/",
)({
	component: SkillsLibraryPage,
});

function SkillsLibraryPage() {
	return <SkillsLibraryView />;
}
