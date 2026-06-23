import type { EdgeRelation } from "@rox/db/enums";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { ScrollArea } from "@rox/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { cn } from "@rox/ui/utils";
import { useMemo, useState } from "react";
import type { ObjectGraphNode } from "./ObjectDetailsPanel";
import { entityKindLabel, LINKABLE_RELATIONS } from "./relations";

export interface LinkPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The object the new edge originates from (its title is shown as context). */
	source: ObjectGraphNode | null;
	/** Candidate target objects (the source is filtered out automatically). */
	candidates: readonly ObjectGraphNode[];
	/** Create the edge: source -> relation -> targetEntityId. */
	onLink: (input: { targetEntityId: string; relation: EdgeRelation }) => void;
	/** Disables the confirm affordance while the link mutation is in flight. */
	pending?: boolean;
}

/**
 * Link Picker: pick a target object + relation to create an edge from `source`.
 * The candidate list is filtered by a title query; the relation defaults to the
 * first {@link LINKABLE_RELATIONS} entry. Calls {@link LinkPickerProps.onLink}
 * which is wired to the cloud `graph.link` mutation by the launchpad.
 */
export function LinkPicker({
	open,
	onOpenChange,
	source,
	candidates,
	onLink,
	pending = false,
}: LinkPickerProps) {
	const [query, setQuery] = useState("");
	const [relation, setRelation] = useState<EdgeRelation>(
		LINKABLE_RELATIONS[0]?.value ?? "references",
	);
	const [targetId, setTargetId] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase();
		return candidates.filter((node) => {
			if (source && node.entityId === source.entityId) return false;
			if (!term) return true;
			return node.title.toLowerCase().includes(term);
		});
	}, [candidates, query, source]);

	const canSubmit = Boolean(targetId) && !pending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Связать объект</DialogTitle>
					<DialogDescription>
						{source
							? `Создать связь от «${source.title}» к другому объекту проекта.`
							: "Выберите объект-источник."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<Select
						value={relation}
						onValueChange={(value) => setRelation(value as EdgeRelation)}
					>
						<SelectTrigger aria-label="Тип связи">
							<SelectValue placeholder="Тип связи" />
						</SelectTrigger>
						<SelectContent>
							{LINKABLE_RELATIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Поиск объекта по названию…"
						aria-label="Поиск объекта"
					/>

					<ScrollArea className="h-48 rounded-md border border-border/50">
						{filtered.length === 0 ? (
							<p className="p-3 text-xs text-muted-foreground">
								Подходящих объектов не найдено.
							</p>
						) : (
							<ul className="divide-y divide-border/40">
								{filtered.map((node) => {
									const selected = node.entityId === targetId;
									return (
										<li key={node.entityId}>
											<button
												type="button"
												onClick={() => setTargetId(node.entityId)}
												className={cn(
													"flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors",
													selected
														? "bg-accent/50"
														: "hover:bg-accent/30 focus-visible:bg-accent/30",
												)}
											>
												<span className="min-w-0 flex-1 truncate">
													{node.title}
												</span>
												<span className="shrink-0 text-[10px] text-muted-foreground">
													{entityKindLabel(node.kind)}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</ScrollArea>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						Отмена
					</Button>
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={() => {
							if (!targetId) return;
							onLink({ targetEntityId: targetId, relation });
						}}
					>
						Связать
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
