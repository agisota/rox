"use client";

import { Badge } from "@rox/ui/badge";
import { Boxes, Tag, Wrench, X } from "lucide-react";
import type { AgentControlsData } from "../../../../hooks/useAgentControls";

type SelectedChipsProps = {
	controls: AgentControlsData;
};

/**
 * Removable chips for the current composer selection (source, skills, labels).
 * Rendered in the composer header shelf above the textarea. Returns null when
 * nothing is selected so the shelf stays collapsed.
 */
export function SelectedChips({ controls }: SelectedChipsProps) {
	const {
		selectedSource,
		selectSource,
		selectedSkillBindings,
		toggleSkillBinding,
		labels,
		removeLabel,
	} = controls;

	const hasSelection =
		Boolean(selectedSource) ||
		selectedSkillBindings.length > 0 ||
		labels.length > 0;

	if (!hasSelection) {
		return null;
	}

	return (
		<>
			{selectedSource && (
				<Badge variant="secondary" className="gap-1">
					<Boxes className="size-3" />
					<span className="max-w-32 truncate">{selectedSource.name}</span>
					<button
						type="button"
						onClick={() => selectSource(null)}
						aria-label={`Убрать источник ${selectedSource.name}`}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</Badge>
			)}
			{selectedSkillBindings.map((binding) => (
				<Badge key={binding.id} variant="secondary" className="gap-1">
					<Wrench className="size-3" />
					<span className="max-w-32 truncate">{binding.label}</span>
					<button
						type="button"
						onClick={() => toggleSkillBinding(binding.id)}
						aria-label={`Убрать навык ${binding.label}`}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</Badge>
			))}
			{labels.map((label) => (
				<Badge key={label} variant="outline" className="gap-1">
					<Tag className="size-3" />
					<span className="max-w-32 truncate">{label}</span>
					<button
						type="button"
						onClick={() => removeLabel(label)}
						aria-label={`Убрать метку ${label}`}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</Badge>
			))}
		</>
	);
}
