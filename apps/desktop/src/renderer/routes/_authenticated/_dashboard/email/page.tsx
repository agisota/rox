import { createFileRoute } from "@tanstack/react-router";
import { EmailView } from "renderer/screens/suite/EmailView";

export const Route = createFileRoute("/_authenticated/_dashboard/email/")({
	component: EmailPage,
});

function EmailPage() {
	return <EmailView />;
}
