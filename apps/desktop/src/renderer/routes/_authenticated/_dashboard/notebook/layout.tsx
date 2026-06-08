import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/notebook")({
	component: NotebookLayout,
});

function NotebookLayout() {
	return <Outlet />;
}
