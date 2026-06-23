import type {
	TemplatePermissionScope,
	TemplatePermissionsManifest,
} from "@rox/shared/template-permissions-manifest";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import {
	LuCircleCheck,
	LuFileText,
	LuFolderGit2,
	LuGitBranch,
	LuPackage,
	LuShieldCheck,
	LuTerminal,
	LuTriangleAlert,
} from "react-icons/lu";

export interface TemplatePermissionsManifestPanelProps {
	/** The pure permissions manifest derived from the selected template spec. */
	manifest: TemplatePermissionsManifest;
	/** Whether the confirm (create) action is in flight — disables both buttons. */
	confirming?: boolean;
	/** Cancel the install and go back to the template grid without creating anything. */
	onCancel: () => void;
	/** Confirm: run the existing project-creation engine. */
	onConfirm: () => void;
}

function ScopeRow({ scope }: { scope: TemplatePermissionScope }) {
	const elevated = scope.severity === "elevated";
	const Icon = elevated ? LuTriangleAlert : LuCircleCheck;
	return (
		<li className="flex items-start gap-2 rounded-md border border-border/50 p-2">
			<Icon
				className={cn(
					"mt-0.5 size-4 shrink-0",
					elevated ? "text-amber-600 dark:text-amber-400" : "text-emerald-600",
				)}
				aria-hidden
			/>
			<div className="min-w-0 space-y-0.5">
				<div className="text-xs font-medium text-foreground">{scope.title}</div>
				<div className="truncate text-xs text-muted-foreground">
					{scope.detail}
				</div>
			</div>
		</li>
	);
}

function ManifestSection({
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
 * Pre-install permissions manifest confirm step. Presentational + prop-driven:
 * it lists exactly what creating a project from the selected template WILL apply
 * — derived purely by `deriveTemplatePermissionsManifest` (it never creates
 * anything) — as a set of reviewable scopes (repository reach, preset
 * application, file writes, command execution), followed by the concrete presets
 * / files / commands behind those scopes, and the derived project name. It
 * requires an explicit "Подтвердить и создать" to proceed; "Отмена" returns to
 * the gallery.
 *
 * Gating and the live confirm handoff are wired by {@link TemplateGalleryModal};
 * this component stays side-effect-free so it can be unit-tested with static
 * rendering.
 */
export function TemplatePermissionsManifestPanel({
	manifest,
	confirming = false,
	onCancel,
	onConfirm,
}: TemplatePermissionsManifestPanelProps) {
	const hasPresets = manifest.starterPresets.length > 0;
	const hasFiles = manifest.scaffoldFiles.length > 0;
	const hasCommands = manifest.setupCommands.length > 0;
	const isClone = manifest.createMode === "clone-repo";
	const CreateModeIcon = isClone ? LuFolderGit2 : LuGitBranch;

	return (
		<section
			className="space-y-4"
			aria-label={`Манифест разрешений шаблона: ${manifest.templateName}`}
		>
			<div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0 space-y-0.5">
						<div className="text-sm font-semibold text-foreground">
							{manifest.templateName}
						</div>
						{manifest.description && (
							<p className="text-xs text-muted-foreground">
								{manifest.description}
							</p>
						)}
					</div>
					<span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
						<CreateModeIcon className="size-3.5" aria-hidden />
						{isClone ? "Клонирование репозитория" : "Пустой git-workspace"}
					</span>
				</div>
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
					<dt className="text-muted-foreground">Имя проекта</dt>
					<dd className="truncate font-mono text-foreground">
						{manifest.projectName}
					</dd>
					{manifest.repoUrl && (
						<>
							<dt className="text-muted-foreground">Репозиторий</dt>
							<dd className="truncate font-mono text-foreground">
								{manifest.repoUrl}
							</dd>
						</>
					)}
				</dl>
			</div>

			<div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
				<LuShieldCheck
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<p className="text-xs text-muted-foreground">
					Подтвердите, что разрешаете шаблону выполнить перечисленные ниже
					действия. Ничего не создаётся и не запускается, пока вы не нажмёте
					«Подтвердить и создать».
				</p>
			</div>

			<ManifestSection
				icon={LuShieldCheck}
				title="Будет применено"
				count={manifest.scopes.length}
			>
				<ul className="space-y-1.5">
					{manifest.scopes.map((scope) => (
						<ScopeRow key={scope.id} scope={scope} />
					))}
				</ul>
			</ManifestSection>

			{hasPresets && (
				<ManifestSection
					icon={LuPackage}
					title="Стартовые пресеты"
					count={manifest.starterPresets.length}
				>
					<ul className="space-y-1.5">
						{manifest.starterPresets.map((preset) => (
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
				</ManifestSection>
			)}

			{hasFiles && (
				<ManifestSection
					icon={LuFileText}
					title="Файлы"
					count={manifest.scaffoldFiles.length}
				>
					<ul className="flex flex-wrap gap-1.5">
						{manifest.scaffoldFiles.map((file) => (
							<li
								key={file.path}
								className="rounded border border-border/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
							>
								{file.path}
							</li>
						))}
					</ul>
				</ManifestSection>
			)}

			{hasCommands && (
				<ManifestSection
					icon={LuTerminal}
					title="Команды настройки"
					count={manifest.setupCommands.length}
				>
					<ul className="space-y-1">
						{manifest.setupCommands.map((command) => (
							<li
								key={command}
								className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
							>
								{command}
							</li>
						))}
					</ul>
				</ManifestSection>
			)}

			{manifest.unknownStarterPresetIds.length > 0 && (
				<p className="text-xs text-amber-700 dark:text-amber-300">
					Неизвестные пресеты (будут пропущены):{" "}
					{manifest.unknownStarterPresetIds.join(", ")}
				</p>
			)}

			<div className="flex items-center justify-between gap-2 pt-1">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={onCancel}
					disabled={confirming}
				>
					Отмена
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={onConfirm}
					disabled={confirming}
					className={cn(confirming && "opacity-70")}
				>
					{confirming ? "Создание…" : "Подтвердить и создать"}
				</Button>
			</div>
		</section>
	);
}
