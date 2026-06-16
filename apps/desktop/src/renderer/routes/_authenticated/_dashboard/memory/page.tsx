import { createFileRoute } from "@tanstack/react-router";
import { MemoryView } from "renderer/screens/memory/MemoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/memory/")({
	component: MemoryPage,
});

function MemoryPage() {
	return <MemoryView />;
}
