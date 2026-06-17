import { createFileRoute } from "@tanstack/react-router";
import { PipelinesIndex } from "./components/PipelinesIndex";

/**
 * Agent Pipelines index route — lists the org's agent pipelines and creates new
 * ones from templates. Pipeline config is cloud (Neon) data read over the cloud
 * tRPC client (see `renderer/lib/api-trpc-react`), not Electric. The
 * `_dashboard` shell (sidebar + TopBar) wraps this via the parent layout.
 */
export const Route = createFileRoute("/_authenticated/_dashboard/pipelines/")({
	component: PipelinesPage,
});

function PipelinesPage() {
	return <PipelinesIndex />;
}
