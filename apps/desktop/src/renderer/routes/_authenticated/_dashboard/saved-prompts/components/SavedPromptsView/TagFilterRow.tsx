import { cn } from "@rox/ui/utils";
import { LuX } from "react-icons/lu";

export interface TagFilterRowProps {
	tags: string[];
	selected: string[];
	onToggle: (tag: string) => void;
	onClear: () => void;
}

/**
 * Multi-select tag chip row (AND semantics). Lives under the sticky toolbar;
 * selecting chips narrows the list to prompts carrying ALL selected tags.
 */
export function TagFilterRow({
	tags,
	selected,
	onToggle,
	onClear,
}: TagFilterRowProps) {
	if (tags.length === 0) return null;

	const selectedSet = new Set(selected);

	return (
		<div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
			{tags.map((tag) => {
				const isOn = selectedSet.has(tag);
				return (
					<button
						key={tag}
						type="button"
						aria-pressed={isOn}
						onClick={() => onToggle(tag)}
						className={cn(
							"rounded-full border px-2.5 py-0.5 text-xs transition-colors",
							isOn
								? "border-primary bg-primary/15 text-foreground"
								: "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
						)}
					>
						{tag}
					</button>
				);
			})}
			{selected.length > 0 && (
				<button
					type="button"
					onClick={onClear}
					className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<LuX className="size-3" />
					Сбросить
				</button>
			)}
		</div>
	);
}
