import { AnimatedSkeleton } from "@rox/ui/motion";
import { SpringInCard } from "../SpringInCard";

/** Loading skeleton: a column of timeline-shaped rows with shimmer. */
export function FeedSkeleton() {
	return (
		<div className="space-y-2 pt-3 pl-9">
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<div
					key={i}
					className="glass-panel flex items-center gap-3 rounded-lg border border-border/40 p-3"
				>
					<AnimatedSkeleton className="size-2.5 rounded-full" />
					<AnimatedSkeleton className="h-4 flex-1" />
					<AnimatedSkeleton className="h-3 w-16" />
				</div>
			))}
		</div>
	);
}

/** Ready-but-empty feed — exact RU copy preserved from the legacy surface. */
export function FeedEmpty() {
	return (
		<SpringInCard className="glass-panel mt-3 flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed py-20 text-center">
			<span className="text-foreground text-sm">Лента пока пуста</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				Здесь в реальном времени появляются события автоматизаций — каждый
				запуск добавляет запись.
			</span>
		</SpringInCard>
	);
}

/** Empty result for an active filter set. */
export function FeedFilterEmpty({ onReset }: { onReset: () => void }) {
	return (
		<SpringInCard className="glass-panel mt-3 flex flex-col items-center justify-center rounded-lg border border-border/60 border-dashed py-20 text-center">
			<span className="text-foreground text-sm">Ничего не найдено</span>
			<span className="mt-1 max-w-sm text-muted-foreground text-xs">
				Под текущие фильтры нет событий.
			</span>
			<button
				type="button"
				onClick={onReset}
				className="mt-3 rounded-full border border-border/60 bg-foreground/[0.06] px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm transition-colors hover:border-border hover:text-foreground"
			>
				Сбросить фильтры
			</button>
		</SpringInCard>
	);
}
