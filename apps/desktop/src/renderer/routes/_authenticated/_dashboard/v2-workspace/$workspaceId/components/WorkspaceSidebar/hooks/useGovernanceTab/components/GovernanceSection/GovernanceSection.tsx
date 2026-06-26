import { Button } from "@rox/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import {
	GOVERNANCE_KIND_META,
	type GovernanceKind,
	type WorkspaceGovernanceItemRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { GovernanceAddInput } from "../GovernanceAddInput";
import { GovernanceItemRow } from "../GovernanceItemRow";

interface GovernanceSectionProps {
	kind: GovernanceKind;
	items: WorkspaceGovernanceItemRow[];
	onAdd: (kind: GovernanceKind, text: string) => void;
	onPlay: (item: WorkspaceGovernanceItemRow) => void;
	onDiscuss: (item: WorkspaceGovernanceItemRow) => void;
	onRemove: (item: WorkspaceGovernanceItemRow) => void;
}

/**
 * One collapsible governance section (ЦЕЛИ / ЗАДАЧИ / МИССИИ): a sticky header
 * with a count + add toggle, an optional inline add input, and the item rows.
 */
export function GovernanceSection({
	kind,
	items,
	onAdd,
	onPlay,
	onDiscuss,
	onRemove,
}: GovernanceSectionProps) {
	const meta = GOVERNANCE_KIND_META[kind];
	const [collapsed, setCollapsed] = useState(false);
	const [adding, setAdding] = useState(false);

	return (
		<section className="flex flex-col">
			<div className="sticky top-0 z-10 flex h-7 items-center gap-1.5 border-b border-border/40 bg-background/80 px-2 backdrop-blur-md">
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className="flex min-w-0 flex-1 items-center gap-1 text-left"
					aria-expanded={!collapsed}
				>
					<ChevronDown
						className={cn(
							"size-3 shrink-0 text-muted-foreground/70 transition-transform",
							collapsed && "-rotate-90",
						)}
					/>
					<span className="truncate font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
						{meta.label}
					</span>
					{items.length > 0 && (
						<span className="shrink-0 rounded-full bg-card/60 px-1.5 font-mono text-[10px] text-muted-foreground/80">
							{items.length}
						</span>
					)}
				</button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-5 shrink-0 rounded text-muted-foreground hover:text-foreground"
							onClick={() => {
								setCollapsed(false);
								setAdding(true);
							}}
							aria-label={`Добавить: ${meta.noun}`}
						>
							<Plus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="left">Добавить {meta.noun}</TooltipContent>
				</Tooltip>
			</div>

			{!collapsed && (
				<div className="flex flex-col gap-px py-1">
					{adding && (
						<GovernanceAddInput
							placeholder={`Новая ${meta.noun}…`}
							onSubmit={(text) => onAdd(kind, text)}
							onCancel={() => setAdding(false)}
						/>
					)}
					{items.length === 0 && !adding ? (
						<button
							type="button"
							onClick={() => setAdding(true)}
							className="px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
						>
							Пусто — добавить {meta.noun}
						</button>
					) : (
						<div className="px-1">
							{items.map((item) => (
								<GovernanceItemRow
									key={item.id}
									item={item}
									onPlay={onPlay}
									onDiscuss={onDiscuss}
									onRemove={onRemove}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
