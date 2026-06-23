import { notFound } from "next/navigation";

import { api } from "@/trpc/server";
import { AgentsHeader } from "../../../components/AgentsHeader";
import { getAgentsUiAccess } from "../../../utils/getAgentsUiAccess";
import { PipelineEditor } from "../components/PipelineEditor";

/**
 * The pipeline canvas editor route. Loads the pipeline server-side (org-scoped
 * via the `pipeline.get` procedure) and hands it to the client editor island.
 */
export default async function PipelineEditorPage({
	params,
}: {
	params: Promise<{ pipelineId: string }>;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();
	const { pipelineId } = await params;

	const trpc = await api();
	let pipeline: Awaited<ReturnType<typeof trpc.pipeline.get.query>> | null =
		null;
	try {
		pipeline = await trpc.pipeline.get.query({ pipelineId });
	} catch (error) {
		console.error("[PipelineEditorPage] failed to load pipeline", error);
	}

	if (!pipeline) {
		notFound();
	}

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
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
		</>
	);
}
