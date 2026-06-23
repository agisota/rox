import { createFileRoute } from "@tanstack/react-router";
import { InboxView } from "renderer/screens/suite/InboxView";

export const Route = createFileRoute("/_authenticated/_dashboard/inbox/")({
	component: InboxPage,
});

function InboxPage() {
	return <InboxView />;
}
