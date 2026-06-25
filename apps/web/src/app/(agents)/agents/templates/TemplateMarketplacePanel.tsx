"use client";

import {
	isTemplateEntryUsable,
	PROJECT_TEMPLATE_ENTRIES,
	type ProjectTemplateEntry,
	type TemplateIconKey,
} from "@rox/shared/project-templates";
import { Badge } from "@rox/ui/badge";
import { cn } from "@rox/ui/utils";
import {
	Boxes,
	Flame,
	Globe,
	Layers,
	type LucideIcon,
	MessageSquare,
	Rocket,
	Server,
	Smartphone,
	Store,
} from "lucide-react";

/**
 * Web parity of the desktop `templates.marketplace` panel: a browse view of the
 * real Rox project templates (the cross-platform `PROJECT_TEMPLATE_ENTRIES`
 * catalog in `@rox/shared`). Each repo-backed template links to its source (the
 * "create a project from this" affordance available on the web without a desktop
 * project-creation runtime); preset-only templates show the empty-workspace
 * presets they would apply. Honest by construction — it never fakes a creation
 * engine the web session does not have; it surfaces exactly the catalog the
 * desktop gallery offers, deep-linked.
 *
 * Mounted only once {@link resolveTemplateMarketplaceGate} opens.
 */

/** Map the platform-agnostic icon token to a concrete `lucide-react` icon. */
const ICON_BY_KEY: Record<TemplateIconKey, LucideIcon> = {
	layers: Layers,
	globe: Globe,
	message: MessageSquare,
	smartphone: Smartphone,
	boxes: Boxes,
	flame: Flame,
	rocket: Rocket,
	server: Server,
};

export interface TemplateMarketplacePanelProps {
	/** Templates to list. Defaults to the shared catalog (same as desktop). */
	templates?: readonly ProjectTemplateEntry[];
}

export function TemplateMarketplacePanel({
	templates = PROJECT_TEMPLATE_ENTRIES,
}: TemplateMarketplacePanelProps) {
	return (
		<section className="space-y-4" aria-label="Маркетплейс шаблонов">
			<div className="flex items-center gap-2">
				<Store className="size-5 text-muted-foreground" />
				<div>
					<h2 className="font-semibold text-lg">Маркетплейс шаблонов</h2>
					<p className="text-muted-foreground text-sm">
						Готовые шаблоны проектов Rox — репозитории и пустые git-workspace с
						пресетами. Откройте источник, чтобы создать проект из шаблона.
					</p>
				</div>
			</div>

			<ul className="grid gap-3 sm:grid-cols-2">
				{templates.map((template) => (
					<li key={template.id}>
						<TemplateCard template={template} />
					</li>
				))}
			</ul>
		</section>
	);
}

function TemplateCard({ template }: { template: ProjectTemplateEntry }) {
	const Icon = ICON_BY_KEY[template.iconKey];
	const usable = isTemplateEntryUsable(template);
	const presetCount = template.starterPresetIds?.length ?? 0;

	const body = (
		<div className="flex w-full items-start gap-3">
			<div
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-md",
					template.accentClassName,
				)}
			>
				<Icon className="size-5" aria-hidden />
			</div>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{template.name}</span>
					{template.repo ? (
						<Badge variant="outline">Репозиторий</Badge>
					) : (
						<Badge variant="secondary">Пресетов: {presetCount}</Badge>
					)}
				</div>
				{template.description ? (
					<p className="line-clamp-2 text-muted-foreground text-xs">
						{usable ? template.description : "Скоро"}
					</p>
				) : null}
			</div>
		</div>
	);

	// Repo-backed templates deep-link to their source — the create affordance
	// available on the web without a desktop runtime. Preset-only templates have
	// no external URL, so the card is shown but inert (no fake route).
	if (template.repo) {
		return (
			<a
				href={template.repo}
				target="_blank"
				rel="noreferrer noopener"
				className="block rounded-md border border-border/60 p-3 outline-none transition-colors hover:border-border hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring"
			>
				{body}
			</a>
		);
	}

	return (
		<div className="block rounded-md border border-border/60 p-3">{body}</div>
	);
}
