import { AnimatedSkeleton } from "@rox/ui/motion";

/** Loading skeleton mirroring the reflection day layout (header + streams). */
export function ReflectionSkeleton() {
	return (
		<div className="space-y-12">
			{[0, 1, 2].map((i) => (
				<div key={i} className="space-y-3">
					<AnimatedSkeleton className="h-4 w-40" />
					<AnimatedSkeleton className="h-20 w-full" />
					<AnimatedSkeleton className="h-16 w-3/4" />
				</div>
			))}
		</div>
	);
}
