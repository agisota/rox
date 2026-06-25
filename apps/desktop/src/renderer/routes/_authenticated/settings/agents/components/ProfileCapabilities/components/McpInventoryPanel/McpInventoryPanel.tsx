import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { CoverageBadge } from "../CoverageBadge/CoverageBadge";

export interface McpInventoryPanelProps {
	personaId: string;
}

/**
 * MCP inventory panel (F47, #644). Searchable list of MCP servers and their
 * tools, grouped under categories, with an `enabled/total` server-coverage
 * badge for the active persona. Read-only: assignment of MCP servers happens
 * elsewhere; this is the inventory lens. No secret value is present — the router
 * returns only name/description/category.
 */
export function McpInventoryPanel({ personaId }: McpInventoryPanelProps) {
	const trpc = useTRPC();
	const [search, setSearch] = useState("");

	const inventoryQuery = useQuery(
		trpc.profileCapabilities.mcpInventory.queryOptions({
			personaId,
			search: search.trim() ? search.trim() : undefined,
		}),
	);

	const data = inventoryQuery.data;

	if (!data && inventoryQuery.isLoading) {
		return (
			<div className="space-y-2 pt-3">
				<Skeleton className="h-9 w-full rounded-lg" />
				<Skeleton className="h-24 w-full rounded-lg" />
			</div>
		);
	}

	return (
		<div className="space-y-3 pt-3">
			<div className="flex items-center justify-between gap-3">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Поиск инструментов MCP"
						className="pl-8"
					/>
				</div>
				{data ? (
					<CoverageBadge
						enabled={data.coverage.enabled}
						total={data.coverage.total}
					/>
				) : null}
			</div>

			{data ? (
				<div className="space-y-3">
					{data.servers.map((server) => (
						<div key={server.slug} className="rounded-lg border p-3">
							<div className="flex items-center justify-between">
								<p className="font-medium text-sm">{server.label}</p>
								<Badge variant={server.enabled ? "default" : "secondary"}>
									{server.enabled ? "включён" : "выключен"}
								</Badge>
							</div>
							<p className="text-muted-foreground text-xs">
								{server.toolCount} инструментов
							</p>
						</div>
					))}

					{data.tools.length === 0 ? (
						<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
							Инструменты не найдены.
						</p>
					) : (
						<ul className="divide-y rounded-lg border">
							{data.tools.map((tool) => (
								<li key={tool.name} className="flex items-start gap-3 p-3">
									<Badge variant="outline" className="shrink-0">
										{tool.category}
									</Badge>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium font-mono text-xs">
											{tool.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{tool.description}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}
		</div>
	);
}
