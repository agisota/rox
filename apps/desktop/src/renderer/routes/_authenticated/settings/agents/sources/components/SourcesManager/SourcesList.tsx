import type { AgentSourceStatus } from "@rox/db/enums";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { SourceFormInit } from "./sourceFormState";
import {
	kindLabel,
	statusBadgeVariant,
	statusLabel,
	statusTransitions,
} from "./sourceStatus";

type SourcesListProps = {
	organizationId: string;
	onEdit: (id: string, init: SourceFormInit) => void;
};

/**
 * Management list for Agent-Native sources (desktop parity port of the web
 * `(agents)/agents/sources/components/SourcesManager/SourcesList.tsx`). Reuses
 * the EXACT cross-platform `agentSource` procedures over the cloud tRPC proxy
 * ({@link useTRPC} === `useCloudTrpc`, the `@rox/trpc` AppRouter the web surface
 * uses):
 *  - `agentSource.list`      → the credential-free projection for the rows,
 *  - `agentSource.setStatus` → the lifecycle transitions (draft/active/…).
 *
 * Both the list query and the status mutation are org-scoped; `setStatus` is
 * org-admin gated server-side, so a non-admin's transition surfaces the router's
 * FORBIDDEN as a toast rather than silently succeeding.
 *
 * Cache-first: persisted rows render immediately; the skeleton shows only while
 * there is no data yet.
 */
export function SourcesList({ organizationId, onEdit }: SourcesListProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const sourcesQuery = useQuery(
		trpc.agentSource.list.queryOptions({ organizationId }),
	);

	const setStatusMutation = useMutation(
		trpc.agentSource.setStatus.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.agentSource.list.queryKey({ organizationId }),
				});
				toast.success("Статус обновлён");
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось обновить статус");
			},
		}),
	);

	const sources = sourcesQuery.data ?? [];

	if (sources.length === 0 && sourcesQuery.isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-16 w-full rounded-lg" />
				<Skeleton className="h-16 w-full rounded-lg" />
			</div>
		);
	}

	if (sourcesQuery.isError) {
		return (
			<div className="rounded-lg border border-destructive/40 p-4 text-sm">
				<p className="text-destructive">Не удалось загрузить источники.</p>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="mt-2"
					onClick={() => void sourcesQuery.refetch()}
				>
					<RefreshCw className="size-3.5" />
					Повторить
				</Button>
			</div>
		);
	}

	if (sources.length === 0) {
		return (
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Источников пока нет. Подключите первый, чтобы привязывать его к
				запускам.
			</p>
		);
	}

	const applyStatus = (id: string, status: AgentSourceStatus) =>
		setStatusMutation.mutate({ id, organizationId, status });

	return (
		<ul className="divide-y rounded-lg border">
			{sources.map((source) => (
				<li
					key={source.id}
					className="flex items-center justify-between gap-4 p-4"
				>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="truncate font-medium">{source.name}</span>
							<Badge variant={statusBadgeVariant(source.status)}>
								{statusLabel(source.status)}
							</Badge>
							<Badge variant="outline">{kindLabel(source.kind)}</Badge>
						</div>
						<p className="truncate text-muted-foreground text-xs">
							{source.slug}
							{source.endpointUrl ? ` · ${source.endpointUrl}` : ""}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-1">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() =>
								onEdit(source.id, {
									name: source.name,
									slug: source.slug,
									kind: source.kind,
									endpointUrl: source.endpointUrl,
									description: source.description,
								})
							}
						>
							<Pencil className="size-3.5" />
							Изменить
						</Button>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									aria-label="Изменить статус"
									disabled={setStatusMutation.isPending}
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>Сменить статус</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{statusTransitions(source.status).map((status) => (
									<DropdownMenuItem
										key={status}
										onSelect={() => applyStatus(source.id, status)}
									>
										{statusLabel(status)}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</li>
			))}
		</ul>
	);
}
