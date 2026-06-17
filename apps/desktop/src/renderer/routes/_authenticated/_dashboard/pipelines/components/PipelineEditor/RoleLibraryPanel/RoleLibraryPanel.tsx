import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ScrollArea } from "@rox/ui/scroll-area";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Sparkles } from "lucide-react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { ROLE_TEMPLATES } from "../../templates";

type RoleLibraryPanelProps = {
	/** Project scope for the role list (optional org-wide otherwise). */
	v2ProjectId?: string;
	/** Add an agent-role node bound to the given role slug + label. */
	onAddRole: (roleSlug: string, label: string) => void;
};

/**
 * The role library: lists the org's agent roles (`agentRole.list`), lets the
 * user seed the four built-in roles, and adds a role to the canvas as an
 * `agent_run` node bound to that role's slug.
 *
 * Cache-first (AGENTS.md rule 9): existing role rows render immediately; the
 * `isLoading` branch only shows when there is no data yet.
 */
export function RoleLibraryPanel({
	v2ProjectId,
	onAddRole,
}: RoleLibraryPanelProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const rolesQuery = useQuery(
		trpc.agentRole.list.queryOptions({ v2ProjectId }),
	);

	const seedMutation = useMutation(
		trpc.agentRole.seedBuiltins.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.agentRole.list.queryKey({ v2ProjectId }),
				});
				toast.success("Базовые роли добавлены");
			},
			onError: (error) => {
				console.error("[RoleLibraryPanel] seedBuiltins failed", error);
				toast.error("Не удалось добавить базовые роли");
			},
		}),
	);

	const roles = rolesQuery.data ?? [];
	const hasRoles = roles.length > 0;

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-medium">Библиотека ролей</h2>
				<Button
					size="sm"
					variant="outline"
					disabled={seedMutation.isPending}
					onClick={() => seedMutation.mutate({ v2ProjectId })}
				>
					<Sparkles className="size-3.5" /> Базовые
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="flex flex-col gap-2 pr-2">
					{hasRoles
						? roles.map((role) => (
								<RoleRow
									key={role.skill.id}
									slug={role.skill.slug}
									name={role.skill.name}
									description={role.skill.description}
									onAdd={() => onAddRole(role.skill.slug, role.skill.name)}
								/>
							))
						: null}

					{!hasRoles && !rolesQuery.isLoading && (
						<div className="rounded-md border border-dashed p-3">
							<p className="text-xs text-muted-foreground">
								Пока нет сохранённых ролей. Добавьте базовые или из шаблонов
								ниже.
							</p>
						</div>
					)}

					{!hasRoles && rolesQuery.isLoading && (
						<p className="py-4 text-center text-xs text-muted-foreground">
							Загрузка ролей…
						</p>
					)}

					<div className="mt-3 mb-1 flex items-center gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							Шаблоны ролей
						</span>
						<div className="h-px flex-1 bg-border" />
					</div>
					{ROLE_TEMPLATES.map((template) => (
						<RoleRow
							key={template.slug}
							slug={template.slug}
							name={template.name}
							description={template.description}
							onAdd={() => onAddRole(template.slug, template.name)}
							isTemplate
						/>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}

function RoleRow({
	slug,
	name,
	description,
	onAdd,
	isTemplate,
}: {
	slug: string;
	name: string;
	description: string | null;
	onAdd: () => void;
	isTemplate?: boolean;
}) {
	return (
		<div className="group flex items-start gap-2 rounded-md border bg-card p-2 transition-colors hover:border-primary/50">
			<Bot className="mt-0.5 size-4 shrink-0 text-primary" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm font-medium">{name}</span>
					{isTemplate && (
						<Badge variant="outline" className="text-[10px]">
							шаблон
						</Badge>
					)}
				</div>
				<p className="truncate font-mono text-[11px] text-muted-foreground">
					{slug}
				</p>
				{description && (
					<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
						{description}
					</p>
				)}
			</div>
			<Button
				size="icon"
				variant="ghost"
				className="size-7 shrink-0"
				aria-label={`Добавить ${name}`}
				onClick={onAdd}
			>
				<Plus className="size-4" />
			</Button>
		</div>
	);
}
