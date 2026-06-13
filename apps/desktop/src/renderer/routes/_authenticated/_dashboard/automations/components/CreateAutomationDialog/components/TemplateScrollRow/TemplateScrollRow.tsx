import {
	AUTOMATION_TEMPLATES_FLAT,
	type AutomationTemplate,
} from "../../../../templates";

interface TemplateScrollRowProps {
	onSelectTemplate: (template: AutomationTemplate) => void;
}

/**
 * Compact horizontal strip of automation templates shown above the prompt
 * editor in the compose view. Clicking a card applies the template inline
 * (without leaving compose). The full "Use template" gallery remains available
 * via `TemplateGalleryPanel`.
 */
export function TemplateScrollRow({
	onSelectTemplate,
}: TemplateScrollRowProps) {
	return (
		<div
			className="flex gap-2 overflow-x-auto pb-1"
			role="listbox"
			aria-label="Быстрые шаблоны"
		>
			{AUTOMATION_TEMPLATES_FLAT.map((template) => (
				<button
					key={template.id}
					type="button"
					role="option"
					aria-selected={false}
					onClick={() => onSelectTemplate(template)}
					title={template.description}
					className="flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs transition-all duration-150 hover:border-border/80 hover:bg-accent/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<span className="text-sm leading-none">{template.emoji}</span>
					<span className="whitespace-nowrap font-medium">{template.name}</span>
				</button>
			))}
		</div>
	);
}
