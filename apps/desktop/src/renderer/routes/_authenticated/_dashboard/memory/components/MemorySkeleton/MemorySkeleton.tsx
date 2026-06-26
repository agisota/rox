import { Skeleton } from "@rox/ui/skeleton";

/**
 * Loading placeholder shown while the memory live query has not finished its
 * first sync. Three group cards so the layout doesn't jump and — per the
 * cache-first rule — seed DEFAULT_MEMORIES never flash before real rows hydrate.
 */
export function MemorySkeleton() {
	return (
		<div className="space-y-5">
			{[0, 1, 2].map((card) => (
				<section key={card} className="rounded-lg border border-border p-4">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="mt-2 h-3 w-48" />
					<div className="mt-3 space-y-1.5">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-5/6" />
					</div>
					<Skeleton className="mt-3 h-8 w-full" />
				</section>
			))}
		</div>
	);
}
