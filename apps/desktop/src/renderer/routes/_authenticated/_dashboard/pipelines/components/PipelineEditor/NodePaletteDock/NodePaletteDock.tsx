import { Badge } from "@rox/ui/badge";
import { Input } from "@rox/ui/input";
import { cn } from "@rox/ui/utils";
import { categoryAccent } from "@rox/workflow-core";
import { useQuery } from "@tanstack/react-query";
import { Bot, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { setNodeDragData } from "../node-drag";
import { resolveNodeIcon } from "../nodes/RegistryNode";
import {
	buildPaletteGroups,
	countEntries,
	type PaletteEntry,
} from "./paletteModel";

type NodePaletteDockProps = {
	/** Project scope for the role list (org-wide when undefined). */
	v2ProjectId?: string;
	/** Add a node of the given registry type (click-to-add at a default position). */
	onAddNode: (
		type: string,
		opts?: { roleSlug?: string; label?: string },
	) => void;
};

/**
 * The left-dock node palette (dify/sim parity): a search box over a categorized,
 * scrollable list of every registered node type, plus the org's agent roles.
 * Entries are draggable onto the canvas AND clickable to add at a default spot.
 * Drags use the shared {@link setNodeDragData} contract so the canvas' existing
 * `onDrop` handler places the node at the cursor.
 *
 * Cache-first (AGENTS.md #9): node types come from the static registry and render
 * instantly; roles come from `agentRole.list` and simply augment the list.
 */
export function NodePaletteDock({
	v2ProjectId,
	onAddNode,
}: NodePaletteDockProps) {
	const [query, setQuery] = useState("");
	const trpc = useTRPC();
	const rolesQuery = useQuery(
		trpc.agentRole.list.queryOptions({ v2ProjectId }),
	);

	const groups = useMemo(() => buildPaletteGroups(query), [query]);
	const total = countEntries(groups);

	const roles = rolesQuery.data ?? [];
	const q = query.trim().toLowerCase();
	const matchedRoles = useMemo(
		() =>
			roles.filter(
				(role) =>
					q.length === 0 ||
					`${role.skill.name} ${role.skill.slug}`.toLowerCase().includes(q),
			),
		[roles, q],
	);

	return (
		<div className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar">
			<div className="border-b p-2">
				<div className="relative">
					<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Поиск узлов…"
						aria-label="Поиск узлов"
						className="h-8 pl-7 text-xs"
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{total === 0 && matchedRoles.length === 0 ? (
					<p className="px-1 py-6 text-center text-xs text-muted-foreground">
						Ничего не найдено
					</p>
				) : null}

				{groups.map((group) => {
					const accent = categoryAccent(group.category);
					return (
						<section key={group.category} className="mb-3">
							<h3 className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
								<span
									className={cn("size-1.5 rounded-full", accent.tintClass)}
									style={{ backgroundColor: accent.color }}
								/>
								{group.label}
							</h3>
							<div className="flex flex-col gap-1">
								{group.entries.map((entry) => (
									<PaletteChip
										key={entry.id}
										entry={entry}
										onAdd={() => onAddNode(entry.id)}
									/>
								))}
							</div>
						</section>
					);
				})}

				{matchedRoles.length > 0 && (
					<section className="mb-2">
						<h3 className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							<Bot className="size-3 text-primary" />
							Агент-роли
						</h3>
						<div className="flex flex-col gap-1">
							{matchedRoles.map((role) => (
								<button
									key={role.skill.id}
									type="button"
									draggable
									onDragStart={(e) =>
										setNodeDragData(e, {
											kind: "agent_run",
											roleSlug: role.skill.slug,
											label: role.skill.name,
										})
									}
									onClick={() =>
										onAddNode("agent_run", {
											roleSlug: role.skill.slug,
											label: role.skill.name,
										})
									}
									className="group flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
								>
									<Bot className="size-3.5 shrink-0 text-primary" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-xs font-medium">
											{role.skill.name}
										</span>
										<span className="block truncate font-mono text-[10px] text-muted-foreground">
											{role.skill.slug}
										</span>
									</span>
								</button>
							))}
						</div>
					</section>
				)}
			</div>

			<p className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
				Перетащите узел на холст или нажмите, чтобы добавить.
			</p>
		</div>
	);
}

function PaletteChip({
	entry,
	onAdd,
}: {
	entry: PaletteEntry;
	onAdd: () => void;
}) {
	const accent = categoryAccent(entry.category);
	const Icon = resolveNodeIcon(entry.icon);
	return (
		<button
			type="button"
			draggable
			onDragStart={(e) =>
				setNodeDragData(e, { kind: entry.id, label: entry.label })
			}
			onClick={onAdd}
			title={entry.description}
			className="group flex w-full cursor-grab items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
		>
			<span
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded-md border",
					accent.tintClass,
					accent.borderClass,
				)}
			>
				<Icon className={cn("size-3.5", accent.textClass)} />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-xs font-medium">
					{entry.label}
				</span>
				{entry.description && (
					<span className="block truncate text-[10px] text-muted-foreground">
						{entry.description}
					</span>
				)}
			</span>
			<Badge
				variant="outline"
				className="pointer-events-none shrink-0 px-1 py-0 text-[9px] opacity-0 transition-opacity group-hover:opacity-100"
			>
				+
			</Badge>
		</button>
	);
}
