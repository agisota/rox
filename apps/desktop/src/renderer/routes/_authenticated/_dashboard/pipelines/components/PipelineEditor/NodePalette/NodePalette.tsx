import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { useQuery } from "@tanstack/react-query";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import type { PipelineNodeKind } from "../graph-adapter";
import { ADDABLE_NODE_KINDS, NODE_KIND_META } from "../node-kinds";

type NodePaletteProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Project scope for the role list (org-wide when undefined). */
	v2ProjectId?: string;
	/** Add a node of the given kind (optionally bound to a role) at viewport centre. */
	onPick: (kind: PipelineNodeKind, roleSlug?: string, label?: string) => void;
};

/**
 * The "+ Добавить узел" command palette (cmdk via @rox/ui Command). Lists the
 * addable node kinds and the org's agent roles in one searchable surface
 * (dify/sim parity). Picking an item adds the node at the viewport centre and
 * opens the inspector — the editor owns placement.
 *
 * Cache-first (AGENTS.md #9): node kinds are static and render instantly; roles
 * come from `agentRole.list` and simply augment the list when present.
 */
export function NodePalette({
	open,
	onOpenChange,
	v2ProjectId,
	onPick,
}: NodePaletteProps) {
	const trpc = useTRPC();
	const rolesQuery = useQuery({
		...trpc.agentRole.list.queryOptions({ v2ProjectId }),
		// Only fetch while the palette is actually open.
		enabled: open,
	});
	const roles = rolesQuery.data ?? [];

	const pick = (kind: PipelineNodeKind, roleSlug?: string, label?: string) => {
		onOpenChange(false);
		onPick(kind, roleSlug, label);
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Добавить узел"
			description="Поиск по типам узлов и ролям"
		>
			<CommandInput placeholder="Тип узла или роль…" />
			<CommandList>
				<CommandEmpty>Ничего не найдено.</CommandEmpty>
				<CommandGroup heading="Узлы">
					{ADDABLE_NODE_KINDS.map((kind) => {
						const meta = NODE_KIND_META[kind];
						const Icon = meta.icon;
						return (
							<CommandItem
								key={kind}
								value={`узел ${meta.label} ${meta.description}`}
								onSelect={() => pick(kind)}
							>
								<Icon className={`size-4 ${meta.iconClass}`} />
								<span>{meta.label}</span>
								<span className="ml-auto text-xs text-muted-foreground">
									{meta.description}
								</span>
							</CommandItem>
						);
					})}
				</CommandGroup>

				{roles.length > 0 && (
					<CommandGroup heading="Роли">
						{roles.map((role) => {
							const Icon = NODE_KIND_META.agent_run.icon;
							return (
								<CommandItem
									key={role.skill.id}
									value={`роль ${role.skill.name} ${role.skill.slug}`}
									onSelect={() =>
										pick("agent_run", role.skill.slug, role.skill.name)
									}
								>
									<Icon className="size-4 text-primary" />
									<span className="truncate">{role.skill.name}</span>
									<span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
										{role.skill.slug}
									</span>
								</CommandItem>
							);
						})}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
