import { Card, CardDescription, CardHeader, CardTitle } from "@rox/ui/card";
import { FileText, Workflow } from "lucide-react";
import type { PipelineTemplate } from "../../../templates";

interface PipelineTemplateCardProps {
	template: PipelineTemplate;
	onSelect: (template: PipelineTemplate) => void;
	disabled?: boolean;
}

/**
 * A selectable pipeline-template card for the empty-state gallery. Mirrors the
 * Automations `TemplateCard` styling so both surfaces feel consistent; clicking
 * (or Enter/Space) creates a pipeline from this template directly.
 */
export function PipelineTemplateCard({
	template,
	onSelect,
	disabled = false,
}: PipelineTemplateCardProps) {
	const Icon = template.id === "blank" ? FileText : Workflow;
	const select = () => {
		if (disabled) return;
		onSelect(template);
	};
	return (
		<Card
			data-onboarding-anchor="pipeline-template"
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-disabled={disabled}
			aria-label={`Создать пайплайн из шаблона: ${template.name}`}
			onClick={select}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					select();
				}
			}}
			className="py-4 cursor-pointer transition-all duration-150 hover:border-border/80 hover:bg-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-60"
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<Icon className="size-4 shrink-0 text-primary" />
					{template.name}
				</CardTitle>
				<CardDescription className="line-clamp-2">
					{template.description}
				</CardDescription>
			</CardHeader>
		</Card>
	);
}
