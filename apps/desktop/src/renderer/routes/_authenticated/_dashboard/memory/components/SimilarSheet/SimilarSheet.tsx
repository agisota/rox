import { Button } from "@rox/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@rox/ui/sheet";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { SimilarityCluster } from "../../lib/similarity";

interface SimilarSheetProps {
	cluster: SimilarityCluster | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * The "N похожих" drill-in: lists every member of a near-duplicate cluster and
 * lets the user collapse it to a single record. The user picks which wording to
 * keep (defaults to the freshest, most-recent-first member); "Объединить" then
 * deletes the others through the optimistic Electric collection (bulk
 * `memory.remove`). Client-side and embedding-free — the resident-data stand-in
 * for the deferred Phase-6 pgvector dedup.
 */
export function SimilarSheet({
	cluster,
	open,
	onOpenChange,
}: SimilarSheetProps) {
	const collections = useCollections();
	const [keepId, setKeepId] = useState<string | null>(null);

	// Default to keeping the freshest member whenever the cluster changes.
	useEffect(() => {
		setKeepId(cluster?.members[0]?.id ?? null);
	}, [cluster]);

	if (!cluster) return null;

	const members = cluster.members;
	const toRemove = members.filter((m) => m.id !== keepId);

	const merge = () => {
		if (!keepId || toRemove.length === 0) return;
		for (const item of toRemove) {
			const tx = collections.memoryItems.delete(item.id);
			void tx.isPersisted.promise.catch(() =>
				toast.error("Не удалось объединить — попробуйте ещё раз"),
			);
		}
		toast.success(`Объединено: оставлена 1 запись, удалено ${toRemove.length}`);
		onOpenChange(false);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Похожие записи</SheetTitle>
					<SheetDescription>
						{members.length} записи выглядят как дубли. Выбери, какую оставить —
						остальные будут удалены.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
					{members.map((item) => {
						const keep = item.id === keepId;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setKeepId(item.id)}
								className={cn(
									"flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
									keep
										? "border-primary bg-primary/5"
										: "border-border hover:bg-muted/60",
								)}
							>
								<HiOutlineCheckCircle
									className={cn(
										"mt-0.5 size-4 shrink-0 transition-colors",
										keep ? "text-primary" : "text-muted-foreground/40",
									)}
								/>
								<span className="min-w-0 flex-1 select-text text-foreground text-sm leading-snug">
									{item.body}
								</span>
							</button>
						);
					})}
				</div>

				<SheetFooter>
					<Button
						type="button"
						onClick={merge}
						disabled={!keepId || toRemove.length === 0}
						className="w-full"
					>
						Объединить ({toRemove.length} удалить)
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
