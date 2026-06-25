import { createFileRoute } from "@tanstack/react-router";
import { MemoryView } from "renderer/screens/memory/MemoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/memory/")({
	component: MemoryPage,
});

function MemoryPage() {
	return (
		<div
			data-onboarding-anchor="memory-search"
			className="flex h-full min-h-0 w-full flex-1"
		>
			<MemoryView />
		</div>
	);
}
