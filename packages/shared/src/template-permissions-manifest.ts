/**
 * Template Permissions Manifest — a PURE, side-effect-free derivation of exactly
 * what creating a project from a {@link TemplatePreviewInput}-shaped spec WOULD
 * apply, re-framed as a pre-install permissions/scope manifest the user can
 * review and explicitly approve BEFORE the project is created.
 *
 * Where {@link TemplatePreviewPlan} (in `template-preview-sandbox.ts`) is a
 * "what will be created" dry-run, this manifest answers the security question
 * "what is this template allowed to do to my machine before I commit?": the
 * repository scope it will reach (clone a remote vs only initialise a local
 * empty git workspace), the starter presets (named + described) it will apply,
 * the workspace files it will write, and the setup commands it will run. It is
 * built ON TOP of {@link deriveTemplatePreview} so the manifest can never drift
 * from the apply path — the same resolver that the host-service uses feeds both.
 *
 * It NEVER clones a repo, writes a file, runs a command, or contacts any
 * external provider: it only reads the local template definition + the workspace
 * starter-preset catalog. Keeping it in `@rox/shared` lets the desktop renderer
 * render the confirm step without a tRPC round-trip and lets it be unit-tested
 * as a pure function.
 */

import {
	deriveTemplatePreview,
	type TemplatePreviewCreateMode,
	type TemplatePreviewInput,
	type TemplatePreviewPlan,
} from "./template-preview-sandbox";

/** A single reviewable scope the template grants when applied. */
export interface TemplatePermissionScope {
	/** Stable scope id for keys/telemetry (never user-facing copy). */
	id:
		| "clone-repository"
		| "init-empty-workspace"
		| "apply-starter-presets"
		| "write-workspace-files"
		| "run-setup-commands";
	/** Severity used to order/emphasise the scope in the UI. */
	severity: "info" | "elevated";
	/** Short scope title (e.g. "Clone repository"). */
	title: string;
	/** One-line human-readable detail (e.g. the repo URL or preset count). */
	detail: string;
}

/**
 * The computed permissions manifest: the create-time scopes a template will
 * apply, plus the concrete artifacts (presets, files, commands) behind them, all
 * derived from the local template spec with nothing actually applied.
 */
export interface TemplatePermissionsManifest {
	templateId: string;
	templateName: string;
	description?: string;
	/** Derived project name the engine would use (repo basename or default). */
	projectName: string;
	createMode: TemplatePreviewCreateMode;
	/** Present only for `clone-repo` templates. */
	repoUrl?: string;
	/** Starter presets that will be applied, resolved to catalog metadata. */
	starterPresets: TemplatePreviewPlan["starterPresets"];
	/** Files the engine will scaffold (path only). */
	scaffoldFiles: TemplatePreviewPlan["scaffoldFiles"];
	/** Setup commands the engine will run. */
	setupCommands: string[];
	/** Starter ids that don't resolve to a catalog preset (surfaced, not hidden). */
	unknownStarterPresetIds: string[];
	/** Ordered, reviewable scopes summarising what approval grants. */
	scopes: TemplatePermissionScope[];
}

function pluralCommand(count: number): string {
	return count === 1 ? "1 команда" : `${count} команд(ы)`;
}

function pluralFile(count: number): string {
	return count === 1 ? "1 файл" : `${count} файл(ов)`;
}

function pluralPreset(count: number): string {
	return count === 1 ? "1 пресет" : `${count} пресет(ов)`;
}

/**
 * Build the ordered list of reviewable scopes from a derived preview plan. The
 * repository scope always comes first (it is the highest-blast-radius action:
 * cloning reaches the network), followed by preset application, then the
 * concrete file writes and command executions those presets imply. Commands are
 * marked `elevated` because they execute on the user's machine.
 */
function deriveScopes(plan: TemplatePreviewPlan): TemplatePermissionScope[] {
	const scopes: TemplatePermissionScope[] = [];

	if (plan.createMode === "clone-repo") {
		scopes.push({
			id: "clone-repository",
			severity: "elevated",
			title: "Клонировать репозиторий",
			detail: plan.repoUrl ?? "удалённый git-репозиторий",
		});
	} else {
		scopes.push({
			id: "init-empty-workspace",
			severity: "info",
			title: "Создать пустой git-workspace",
			detail: "Локальная инициализация git без удалённого источника",
		});
	}

	if (plan.starterPresets.length > 0) {
		scopes.push({
			id: "apply-starter-presets",
			severity: "info",
			title: "Применить стартовые пресеты",
			detail: pluralPreset(plan.starterPresets.length),
		});
	}

	if (plan.scaffoldFiles.length > 0) {
		scopes.push({
			id: "write-workspace-files",
			severity: "info",
			title: "Записать файлы в workspace",
			detail: pluralFile(plan.scaffoldFiles.length),
		});
	}

	if (plan.setupCommands.length > 0) {
		scopes.push({
			id: "run-setup-commands",
			severity: "elevated",
			title: "Выполнить команды настройки",
			detail: pluralCommand(plan.setupCommands.length),
		});
	}

	return scopes;
}

/**
 * Compute the dry-run permissions manifest for a template. PURE: no I/O, no
 * cloning, no command execution, no external provider — it only reads the
 * template spec and the local starter-preset catalog (via
 * {@link deriveTemplatePreview}).
 */
export function deriveTemplatePermissionsManifest(
	template: TemplatePreviewInput,
): TemplatePermissionsManifest {
	const plan = deriveTemplatePreview(template);
	return {
		templateId: plan.templateId,
		templateName: plan.templateName,
		...(plan.description ? { description: plan.description } : {}),
		projectName: plan.projectName,
		createMode: plan.createMode,
		...(plan.repoUrl ? { repoUrl: plan.repoUrl } : {}),
		starterPresets: plan.starterPresets,
		scaffoldFiles: plan.scaffoldFiles,
		setupCommands: plan.setupCommands,
		unknownStarterPresetIds: plan.unknownStarterPresetIds,
		scopes: deriveScopes(plan),
	};
}

/**
 * Whether a template is meaningfully install-confirmable: it either clones a
 * repo or applies at least one starter preset. Re-exported semantics mirror
 * `isTemplatePreviewable` so the manifest engages for exactly the templates the
 * gallery can actually create.
 */
export { isTemplatePreviewable as isTemplateInstallable } from "./template-preview-sandbox";
