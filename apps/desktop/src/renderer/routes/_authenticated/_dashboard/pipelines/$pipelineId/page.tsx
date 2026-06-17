import { Button } from "@rox/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/api-trpc-react";
import { PipelineEditor } from "../components/PipelineEditor";

/**
 * The pipeline canvas editor route. Loads the pipeline over the cloud tRPC
 * client (org-scoped via `pipeline.get`, wrapped in TanStack Query) — replacing
 * the web feature's server-component fetch — then hands it to the editor.
 *
 * Pipeline config is cloud (Neon) data and is NOT synced via Electric, so the
 * cache-first live-query rule does not apply here; we gate on the query's own
 * loading/error state instead.
 */
export const Route = createFileRoute(
	"/_authenticated/_dashboard/pipelines/$pipelineId/",
)({
	component: PipelineEditorPage,
});

function PipelineEditorPage() {
	const { pipelineId } = Route.useParams();
	const navigate = useNavigate();

	const pipelineQuery = useQuery(
		cloudTrpc.pipeline.get.queryOptions({ pipelineId }),
	);

	if (pipelineQuery.isLoading) {
		return (
			<div className="flex h-[calc(100dvh-3rem)] items-center justify-center">
				<p className="text-sm text-muted-foreground">Загрузка пайплайна…</p>
			</div>
		);
	}

	const pipeline = pipelineQuery.data;
	if (!pipeline) {
		return (
			<div className="flex h-[calc(100dvh-3rem)] flex-col items-center justify-center gap-3 px-4 text-center">
				<p className="max-w-md text-sm text-muted-foreground select-text cursor-text">
					{pipelineQuery.error instanceof Error
						? pipelineQuery.error.message
						: "Пайплайн не найден или недоступен."}
				</p>
				<Button
					variant="outline"
					onClick={() => navigate({ to: "/pipelines" })}
				>
					К списку пайплайнов
				</Button>
			</div>
		);
	}

	return (
		<PipelineEditor
			key={pipeline.id}
			pipeline={{
				id: pipeline.id,
				name: pipeline.name,
				slug: pipeline.slug,
				v2ProjectId: pipeline.v2ProjectId,
				draftState: pipeline.draftState,
			}}
		/>
	);
}
