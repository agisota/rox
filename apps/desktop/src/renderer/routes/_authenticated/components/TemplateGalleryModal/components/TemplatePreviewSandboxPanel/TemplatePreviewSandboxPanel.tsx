import type { TemplatePreviewPlan } from "@rox/shared/template-preview-sandbox";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import {
	LuFileText,
	LuFolderGit2,
	LuGitBranch,
	LuPackage,
	LuTerminal,
} from "react-icons/lu";

export interface TemplatePreviewSandboxPanelProps {
	/** The pure dry-run plan derived from the selected template spec. */
	plan: TemplatePreviewPlan;
	/** Whether the apply (create) action is in flight — disables both buttons. */
	applying?: boolean;
	/** Go back to the template grid without creating anything. */
	onBack: () => void;
	/** Apply the template: run the existing project-creation engine. */
	onApply: () => void;
}

function CreateModeBadge({ plan }: { plan: TemplatePreviewPlan }) {
	const isClone = plan.createMode === "clone-repo";
	const Icon = isClone ? LuFolderGit2 : LuGitBranch;
	return (
		<span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
			<Icon className="size-3.5" aria-hidden />
			{isClone ? "Клонирование репозитория" : "Пустой git-workspace"}
		</span>
	);
}

function PreviewSection({
	icon: Icon,
	title,
	count,
	children,
}: {
	icon: typeof LuFileText;
	title: string;
	count?: number;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-2">
			<div className="flex items-center gap-2">
				<Icon className="size-4 text-muted-foreground" aria-hidden />
				<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{title}
				</h4>
				{typeof count === "number" && (
					<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
						{count}
					</span>
				)}
			</div>
			{children}
		</section>
	);
}

/**
 * Presentational dry-run preview of what creating a project from the selected
 * template WOULD produce — derived purely from the template spec (see
 * `deriveTemplatePreview`), never by creating anything. It lists the project
 * name, the create mode (clone vs empty git workspace), the starter presets it
 * bundles, and the files + setup commands those presets scaffold, then offers an
 * explicit "Создать проект" that hands off to the real creation engine.
 *
 * Intentionally side-effect-free and prop-driven so it can be unit-tested with
 * static rendering; gating and the live apply handoff are wired by
 * {@link TemplateGalleryModal}.
 */
export function TemplatePreviewSandboxPanel({
	plan,
	applying = false,
	onBack,
	onApply,
}: TemplatePreviewSandboxPanelProps) {
	const hasPresets = plan.starterPresets.length > 0;
	const hasFiles = plan.scaffoldFiles.length > 0;
	const hasCommands = plan.setupCommands.length > 0;
	const isClone = plan.createMode === "clone-repo";

	return (
		<section
			className="space-y-4"
			aria-label={`Предпросмотр шаблона: ${plan.templateName}`}
		>
			<div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0 space-y-0.5">
						<div className="text-sm font-semibold text-foreground">
							{plan.templateName}
						</div>
						{plan.description && (
							<p className="text-xs text-muted-foreground">
								{plan.description}
							</p>
						)}
					</div>
					<CreateModeBadge plan={plan} />
				</div>
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
					<dt className="text-muted-foreground">Имя проекта</dt>
					<dd className="truncate font-mono text-foreground">
						{plan.projectName}
					</dd>
					{plan.repoUrl && (
						<>
							<dt className="text-muted-foreground">Репозиторий</dt>
							<dd className="truncate font-mono text-foreground">
								{plan.repoUrl}
							</dd>
						</>
					)}
				</dl>
			</div>

			<p className="text-xs text-muted-foreground">
				Это сухой прогон (dry-run): ничего не создаётся, пока вы не нажмёте
				«Создать проект». Ниже — что именно создаст шаблон.
			</p>

			{isClone && !hasPresets && (
				<p className="text-xs text-muted-foreground">
					Будет склонирован репозиторий выше. Дополнительные файлы и команды не
					добавляются.
				</p>
			)}

			{hasPresets && (
				<PreviewSection
					icon={LuPackage}
					title="Стартовые пресеты"
					count={plan.starterPresets.length}
				>
					<ul className="space-y-1.5">
						{plan.starterPresets.map((preset) => (
							<li
								key={preset.id}
								className="rounded-md border border-border/50 p-2"
							>
								<div className="text-xs font-medium text-foreground">
									{preset.label}
								</div>
								<div className="text-xs text-muted-foreground">
									{preset.description}
								</div>
							</li>
						))}
					</ul>
				</PreviewSection>
			)}

			{hasFiles && (
				<PreviewSection
					icon={LuFileText}
					title="Файлы"
					count={plan.scaffoldFiles.length}
				>
					<ul className="flex flex-wrap gap-1.5">
						{plan.scaffoldFiles.map((file) => (
							<li
								key={file.path}
								className="rounded border border-border/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
							>
								{file.path}
							</li>
						))}
					</ul>
				</PreviewSection>
			)}

			{hasCommands && (
				<PreviewSection
					icon={LuTerminal}
					title="Команды настройки"
					count={plan.setupCommands.length}
				>
					<ul className="space-y-1">
						{plan.setupCommands.map((command) => (
							<li
								key={command}
								className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
							>
								{command}
							</li>
						))}
					</ul>
				</PreviewSection>
			)}

			{plan.unknownStarterPresetIds.length > 0 && (
				<p className="text-xs text-amber-700 dark:text-amber-300">
					Неизвестные пресеты (будут пропущены):{" "}
					{plan.unknownStarterPresetIds.join(", ")}
				</p>
			)}

			<div className="flex items-center justify-between gap-2 pt-1">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onBack}
					disabled={applying}
				>
					Назад
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={onApply}
					disabled={applying}
					className={cn(applying && "opacity-70")}
				>
					{applying ? "Создание…" : "Создать проект"}
				</Button>
			</div>
		</section>
	);
}
