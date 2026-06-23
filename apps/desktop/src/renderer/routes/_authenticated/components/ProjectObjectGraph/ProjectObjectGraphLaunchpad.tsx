import type { EdgeRelation } from "@rox/db/enums";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";
import { LinkPicker } from "./LinkPicker";
import { ObjectDetailsPanel, type ObjectGraphNode } from "./ObjectDetailsPanel";
import { ProjectObjectGraphPanel } from "./ProjectObjectGraphPanel";

export interface ProjectObjectGraphLaunchpadProps {
	/** The v2_project whose object graph this shell operates on. */
	v2ProjectId: string;
	/** Optional fallback when the experiment is off / unavailable. */
	fallback?: React.ReactNode;
}

/**
 * Gated, self-contained Project OS Phase-1 shell over the native Rox object
 * graph (`entities`/`edges`). Renders only when `projectOs.workspaceShell` is
 * enabled and available (it depends solely on the desktop runtime, so it opens
 * locally without Huly or any external provider).
 *
 * Wiring (all reuse of the cloud graph router):
 *  - `graph.projectGraph` → the project's objects + their resolved edges.
 *  - `graph.search` (scoped to `v2ProjectId`) → edge-walking project search.
 *  - `graph.link` → create an edge between two objects from the Link Picker.
 */
export function ProjectObjectGraphLaunchpad({
	v2ProjectId,
	fallback = null,
}: ProjectObjectGraphLaunchpadProps) {
	return (
		<ExperimentalFeatureGate
			featureId="projectOs.workspaceShell"
			fallback={fallback}
		>
			<ProjectObjectGraphShell v2ProjectId={v2ProjectId} />
		</ExperimentalFeatureGate>
	);
}

/** The live shell, mounted only once the gate resolves `available`. */
function ProjectObjectGraphShell({ v2ProjectId }: { v2ProjectId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [linkSourceId, setLinkSourceId] = useState<string | null>(null);

	const graphQuery = useQuery(
		trpc.graph.projectGraph.queryOptions({ v2ProjectId }),
	);

	const trimmedSearch = search.trim();
	// Edge-walking project search: only fires once the user types, scoped to the
	// project. Keyword mode keeps it functional without the #02 embedder.
	const searchQuery = useQuery({
		...trpc.graph.search.queryOptions({
			query: trimmedSearch || "",
			v2ProjectId,
			mode: "keyword",
		}),
		enabled: trimmedSearch.length > 0,
	});

	const allNodes: ObjectGraphNode[] = useMemo(
		() => graphQuery.data?.nodes ?? [],
		[graphQuery.data],
	);
	const allEdges = useMemo(
		() => graphQuery.data?.edges ?? [],
		[graphQuery.data],
	);
	// The master list shows in-project objects (neighbors outside the project are
	// still resolvable as edge endpoints in the details panel, just not listed).
	const projectNodes = useMemo(
		() => allNodes.filter((node) => node.inProject),
		[allNodes],
	);

	// When searching, intersect the project objects with the search hit ids so
	// the same node objects (with kind/title) drive the list.
	const visibleNodes = useMemo(() => {
		if (trimmedSearch.length === 0) return projectNodes;
		const hitIds = new Set((searchQuery.data?.hits ?? []).map((h) => h.id));
		return projectNodes.filter((node) => hitIds.has(node.entityId));
	}, [projectNodes, searchQuery.data, trimmedSearch]);

	const focus = useMemo(
		() => allNodes.find((node) => node.entityId === selectedId) ?? null,
		[allNodes, selectedId],
	);
	const linkSource = useMemo(
		() => allNodes.find((node) => node.entityId === linkSourceId) ?? null,
		[allNodes, linkSourceId],
	);

	const linkMutation = useMutation(
		trpc.graph.link.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.graph.projectGraph.queryKey({ v2ProjectId }),
				});
				setLinkSourceId(null);
				toast.success("Связь создана");
			},
			onError: (error) => {
				logger.error("[ProjectObjectGraph] link failed", error);
				toast.error("Не удалось создать связь");
			},
		}),
	);

	const handleLink = (input: {
		targetEntityId: string;
		relation: EdgeRelation;
	}) => {
		if (!linkSourceId) return;
		linkMutation.mutate({
			idempotencyKey: crypto.randomUUID(),
			sourceEntityId: linkSourceId,
			targetEntityId: input.targetEntityId,
			relation: input.relation,
		});
	};

	const listLoading =
		graphQuery.isLoading || (searchQuery.isLoading && !!trimmedSearch);

	return (
		<div
			className="grid gap-4 md:grid-cols-2"
			data-testid="project-object-graph"
		>
			<ProjectObjectGraphPanel
				nodes={visibleNodes}
				selectedId={selectedId}
				onSelect={setSelectedId}
				searchValue={search}
				onSearchChange={setSearch}
				loading={listLoading}
				truncated={graphQuery.data?.truncated ?? false}
			/>

			{focus ? (
				<ObjectDetailsPanel
					focus={focus}
					nodes={allNodes}
					edges={allEdges}
					onOpenObject={setSelectedId}
					onStartLink={setLinkSourceId}
					v2ProjectId={v2ProjectId}
				/>
			) : (
				<section
					className="flex items-center justify-center rounded-md border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground"
					aria-label="Детали объекта"
				>
					Выберите объект слева, чтобы увидеть его связи.
				</section>
			)}

			<LinkPicker
				open={linkSourceId !== null}
				onOpenChange={(open) => {
					if (!open) setLinkSourceId(null);
				}}
				source={linkSource}
				candidates={projectNodes}
				onLink={handleLink}
				pending={linkMutation.isPending}
			/>
		</div>
	);
}
