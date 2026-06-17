import type { LucideIcon } from "lucide-react";

type ViewCanvasPlaceholderProps = {
	icon: LucideIcon;
	title: string;
	description: string;
	/** Short labels of what this view will render, shown as chips. */
	vocabulary: string[];
};

/**
 * Empty-canvas shell shared by the Map / Flow / Atlas views during phase 0.
 * Renders the view's intent and vocabulary so the switcher is demoable before
 * the real canvas lands. Each view passes its own icon, copy, and chip set.
 */
export function ViewCanvasPlaceholder({
	icon: Icon,
	title,
	description,
	vocabulary,
}: ViewCanvasPlaceholderProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
			<div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
				<Icon className="size-7" aria-hidden="true" />
			</div>
			<div className="flex max-w-md flex-col gap-2">
				<h2 className="text-lg font-semibold text-foreground">{title}</h2>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<ul className="flex max-w-md flex-wrap items-center justify-center gap-2">
				{vocabulary.map((item) => (
					<li
						key={item}
						className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
					>
						{item}
					</li>
				))}
			</ul>
			<p className="text-xs text-muted-foreground/70">Скоро</p>
		</div>
	);
}
