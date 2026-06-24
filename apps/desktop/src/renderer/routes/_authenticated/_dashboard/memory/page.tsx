import { createFileRoute } from "@tanstack/react-router";
import { MemoryView } from "./MemoryView";

export const Route = createFileRoute("/_authenticated/_dashboard/memory/")({
	component: MemoryPage,
});

function MemoryPage() {
	return <MemoryView />;
}
