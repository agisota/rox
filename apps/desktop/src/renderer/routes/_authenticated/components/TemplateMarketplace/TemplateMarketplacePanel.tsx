import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { LuStore } from "react-icons/lu";
import {
	PROJECT_TEMPLATES,
	type ProjectTemplate,
} from "../TemplateGalleryModal/templates";

export interface TemplateMarketplacePanelProps {
	/**
	 * Opens the full Template Gallery (the real apply surface) for the chosen
	 * template. When omitted the panel is a read-only preview.
	 */
	onOpenGallery?: (templateId?: string) => void;
	/** Disables the open affordances (e.g. while a project is being created). */
	disabled?: boolean;
	/**
	 * Templates to list. Defaults to the same catalog the Template Gallery uses
	 * for real project creation, so the marketplace and the apply surface stay in
	 * sync.
	 */
	templates?: readonly ProjectTemplate[];
}

function isTemplateUsable(template: ProjectTemplate): boolean {
	return Boolean(template.repo) || Boolean(template.starterPresetIds?.length);
}

/**
 * Read-only marketplace surface that lists the real Rox project templates and
 * routes the user into the Template Gallery to actually create a project. It is
 * intentionally presentational so it can be unit-tested with static rendering;
 * the gating and the live apply engine are wired in by
 * {@link TemplateMarketplaceLaunchpad}.
 */
export function TemplateMarketplacePanel({
	onOpenGallery,
	disabled = false,
	templates = PROJECT_TEMPLATES,
}: TemplateMarketplacePanelProps) {
	return (
		<section className="space-y-4" aria-label="Маркетплейс шаблонов">
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<LuStore className="size-4 text-muted-foreground" aria-hidden />
						<h3 className="text-sm font-semibold">Маркетплейс шаблонов</h3>
					</div>
					<p className="text-xs text-muted-foreground">
						Создайте проект из готового шаблона Rox — репозитория или пустого
						git-workspace с пресетами.
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					onClick={() => onOpenGallery?.()}
					disabled={disabled || !onOpenGallery}
				>
					Открыть галерею
				</Button>
			</div>

			<ul className="grid gap-2 sm:grid-cols-2">
				{templates.map((template) => {
					const usable = isTemplateUsable(template);
					const Icon = template.icon;
					return (
						<li key={template.id}>
							<button
								type="button"
								onClick={() => onOpenGallery?.(template.id)}
								disabled={disabled || !onOpenGallery || !usable}
								className={cn(
									"flex w-full items-start gap-3 rounded-md border border-border/50 p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
									usable && !disabled && onOpenGallery
										? "cursor-pointer hover:border-border hover:bg-accent/30"
										: "cursor-not-allowed opacity-60",
								)}
							>
								<div
									className={cn(
										"flex size-9 shrink-0 items-center justify-center rounded-md",
										template.bannerClassName,
									)}
								>
									<Icon className="size-4.5" aria-hidden />
								</div>
								<div className="min-w-0">
									<div className="truncate text-sm font-medium text-foreground">
										{template.name}
									</div>
									<div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
										{usable ? template.description : "Скоро"}
									</div>
								</div>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
