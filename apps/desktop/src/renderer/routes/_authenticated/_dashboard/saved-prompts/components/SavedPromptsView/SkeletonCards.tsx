import { Skeleton } from "@rox/ui/skeleton";

/** Shimmer placeholders while the prompt list loads (replaces the old `null`). */
export function SkeletonCards({ count = 5 }: { count?: number }) {
	return (
		<div className="flex flex-col gap-2" aria-hidden>
			{Array.from({ length: count }, (_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
					key={index}
					className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4"
				>
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-4 w-16" />
					</div>
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			))}
		</div>
	);
}
