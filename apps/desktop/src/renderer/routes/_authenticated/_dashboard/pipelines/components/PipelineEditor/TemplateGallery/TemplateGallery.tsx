import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { cn } from "@rox/ui/utils";
import {
	categoryAccent,
	getNodeType,
	type RoxWorkflowState,
} from "@rox/workflow-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PipelineTemplate } from "../../templates";
import { resolveNodeIcon } from "../nodes/RegistryNode";
import {
	buildGalleryGroups,
	countTemplates,
	templateNodeTypes,
} from "./galleryModel";

type TemplateGalleryProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Insert a template's graph into the editor. */
	onInsert: (state: RoxWorkflowState) => void;
	/** Session-local templates (e.g. "Save as template" results), shown first. */
	extraTemplates?: readonly PipelineTemplate[];
};

/**
 * The templates gallery: a searchable, category-grouped overlay of ready-made
 * pipeline graphs (RAG bot, tool agent, classifier-router, ETL, …). Each card
 * previews the template's node-type palette; clicking inserts the graph. The
 * dify/sim "start from a template" surface.
 */
export function TemplateGallery({
	open,
	onOpenChange,
	onInsert,
	extraTemplates,
}: TemplateGalleryProps) {
	const [query, setQuery] = useState("");
	const groups = useMemo(
		() => buildGalleryGroups(query, extraTemplates ?? []),
		[query, extraTemplates],
	);
	const total = countTemplates(groups);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
				<DialogHeader className="border-b p-4">
					<DialogTitle>Шаблоны пайплайнов</DialogTitle>
					<DialogDescription>
						Начните с готового графа и доработайте под себя.
					</DialogDescription>
					<div className="relative mt-2">
						<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							autoFocus
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Поиск шаблонов…"
							aria-label="Поиск шаблонов"
							className="pl-8"
						/>
					</div>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					{total === 0 ? (
						<p className="py-10 text-center text-sm text-muted-foreground">
							Ничего не найдено по запросу «{query}».
						</p>
					) : (
						groups.map((group) => (
							<section key={group.category} className="mb-5 last:mb-0">
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{group.category}
								</h3>
								<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
									{group.templates.map((template) => (
										<TemplateCard
											key={template.id}
											template={template}
											onInsert={() => onInsert(template.build())}
										/>
									))}
								</div>
							</section>
						))
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function TemplateCard({
	template,
	onInsert,
}: {
	template: PipelineTemplate;
	onInsert: () => void;
}) {
	const Icon = resolveNodeIcon(template.icon);
	// Preview the distinct node types as small accent dots (capped).
	const types = useMemo(() => templateNodeTypes(template), [template]);
	const previewTypes = types.slice(0, 7);
	const overflow = types.length - previewTypes.length;

	return (
		<button
			type="button"
			onClick={onInsert}
			className="group flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
		>
			<div className="flex items-start gap-2.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
					<Icon className="size-4 text-primary" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{template.name}</p>
					<p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
						{template.description}
					</p>
				</div>
			</div>

			{/* Node-type preview dots, coloured by category. */}
			<div className="flex items-center gap-1">
				{previewTypes.map((type) => {
					const def = getNodeType(type);
					const accent = def
						? categoryAccent(def.category)
						: categoryAccent("input" as never);
					return (
						<span
							key={type}
							title={def?.label ?? type}
							className={cn("size-2 rounded-full", accent.tintClass)}
							style={{ backgroundColor: accent.color }}
						/>
					);
				})}
				{overflow > 0 && (
					<span className="text-[10px] text-muted-foreground">+{overflow}</span>
				)}
				<span className="ml-auto text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
					Вставить →
				</span>
			</div>
		</button>
	);
}
