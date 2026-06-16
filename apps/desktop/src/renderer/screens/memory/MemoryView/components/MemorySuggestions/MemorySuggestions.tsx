import type { SelectMemoryItem } from "@rox/db/schema";
import { Button } from "@rox/ui/button";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { CATEGORY_LABEL } from "../../groups";

interface MemorySuggestionsProps {
	items: SelectMemoryItem[];
}

/**
 * The agent-suggested memories (status=suggested) shown at the top of the Memory
 * screen with inline Approve / Decline. Both go through the Electric collection
 * (optimistic): approve → status=approved (joins its group), decline →
 * status=dismissed (hidden). Renders nothing when there are no pending
 * suggestions.
 */
export function MemorySuggestions({ items }: MemorySuggestionsProps) {
	const collections = useCollections();
	if (items.length === 0) return null;

	const approve = (id: string) =>
		collections.memoryItems.update(id, (draft) => {
			draft.status = "approved";
		});
	const decline = (id: string) =>
		collections.memoryItems.update(id, (draft) => {
			draft.status = "dismissed";
		});

	return (
		<section className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
			<h2 className="font-medium text-foreground text-sm">
				Агент предлагает запомнить
			</h2>
			<p className="mb-3 text-muted-foreground text-xs">
				{items.length} из твоих сессий — прими нужное
			</p>
			<div className="space-y-2">
				{items.map((item) => (
					<div
						key={item.id}
						className="flex items-start gap-2 rounded-md border border-border bg-background p-2.5"
					>
						<span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
							{CATEGORY_LABEL[item.category]}
						</span>
						<span className="flex-1 text-foreground text-sm leading-snug">
							{item.body}
						</span>
						<div className="flex shrink-0 gap-1">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-xs"
								onClick={() => approve(item.id)}
							>
								Принять
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 px-2 text-muted-foreground text-xs"
								onClick={() => decline(item.id)}
							>
								Отклонить
							</Button>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
