import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { NODE_CATEGORY_LABEL, type NodeCategory } from "@rox/workflow-core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { addableNodeTypes } from "../graph-adapter";
import { resolveNodeIcon } from "../nodes/RegistryNode";

type NodePaletteProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Project scope for the role list (org-wide when undefined). */
	v2ProjectId?: string;
	/** Add a node of the given registry type (optionally bound to a role). */
	onPick: (type: string, roleSlug?: string, label?: string) => void;
};

/**
 * The "+ Добавить узел" command palette (cmdk via @rox/ui Command). Lists every
 * addable registry node type (grouped by category) and the org's agent roles in
 * one searchable surface (dify/sim parity). Picking an item adds the node at the
 * viewport centre and opens the inspector — the editor owns placement.
 *
 * Cache-first (AGENTS.md #9): node types are static (registry) and render
 * instantly; roles come from `agentRole.list` and simply augment the list when
 * present.
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

	// Group the registry's addable types by category for the command list.
	const grouped = useMemo(() => {
		const byCategory = new Map<
			NodeCategory,
			ReturnType<typeof addableNodeTypes>
		>();
		for (const def of addableNodeTypes()) {
			const list = byCategory.get(def.category as NodeCategory) ?? [];
			list.push(def);
			byCategory.set(def.category as NodeCategory, list);
		}
		return [...byCategory.entries()];
	}, []);

	const pick = (type: string, roleSlug?: string, label?: string) => {
		onOpenChange(false);
		onPick(type, roleSlug, label);
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
				{grouped.map(([category, defs]) => (
					<CommandGroup key={category} heading={NODE_CATEGORY_LABEL[category]}>
						{defs.map((def) => {
							const Icon = resolveNodeIcon(def.icon);
							return (
								<CommandItem
									key={def.id}
									value={`узел ${def.label} ${def.id} ${NODE_CATEGORY_LABEL[category]}`}
									onSelect={() => pick(def.id, undefined, def.label)}
								>
									<Icon className={`size-4 ${def.iconClass}`} />
									<span>{def.label}</span>
									<span className="ml-auto text-xs text-muted-foreground">
										{NODE_CATEGORY_LABEL[category]}
									</span>
								</CommandItem>
							);
						})}
					</CommandGroup>
				))}

				{roles.length > 0 && (
					<CommandGroup heading="Роли">
						{roles.map((role) => {
							const Icon = resolveNodeIcon("Bot");
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
