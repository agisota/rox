/**
 * Template Preview Sandbox — a PURE, side-effect-free dry-run of what creating a
 * project from a {@link ProjectTemplate}-shaped spec would produce, computed
 * entirely from the template definition plus the workspace starter-preset
 * catalog. It NEVER clones a repo, writes a file, or mutates state: it only
 * derives the plan the real engine would execute so the UI can show "what this
 * will create" BEFORE the user commits to Apply/Create.
 *
 * The derivation deliberately mirrors the real project-creation engine so the
 * preview can never drift from the apply path:
 *
 *   - project name        → `deriveProjectNameFromUrl(repo)` for repo templates
 *                           (the basename of the repo URL), otherwise the
 *                           template's `defaultProjectName` / `id` — exactly
 *                           what `TemplateGalleryModal.deriveProjectNameFromTemplate`
 *                           passes to `client.project.create`.
 *   - create mode         → `clone-repo` when the template has a `repo`,
 *                           otherwise `empty-git-workspace` (the engine's
 *                           `{ kind: "template" }` vs `{ kind: "empty" }`).
 *   - starter presets     → resolved through `getWorkspaceStarterPresetById` so
 *                           the labels/descriptions match the picker, and their
 *                           scaffold files + setup commands are flattened with
 *                           `resolveWorkspaceStarterPreset` — the SAME resolver
 *                           the host-service `applyWorkspaceStarterPresets` uses,
 *                           so the previewed files/commands are precisely the
 *                           ones the engine writes.
 *
 * Keeping this in `@rox/shared` lets the desktop renderer derive previews without
 * a tRPC round-trip and lets it be unit-tested as a pure function.
 */

import {
	getWorkspaceStarterPresetById,
	resolveWorkspaceStarterPreset,
} from "./workspace-starter-presets";

/**
 * The minimal shape of a project template the preview needs. Structurally
 * compatible with the desktop `ProjectTemplate` (and any template source that
 * feeds the same creation engine) without importing renderer-only types
 * (`IconType`, banner assets) into `@rox/shared`.
 */
export interface TemplatePreviewInput {
	id: string;
	name: string;
	description?: string;
	/** Git remote to clone for repo-backed templates. */
	repo?: string;
	/** Starter preset ids applied to an empty git workspace. */
	starterPresetIds?: readonly string[];
	/** Preferred project name for preset-only (empty) templates. */
	defaultProjectName?: string;
}

/** How the engine would materialise the project. */
export type TemplatePreviewCreateMode = "clone-repo" | "empty-git-workspace";

/** A starter preset the template would apply, resolved to its catalog metadata. */
export interface TemplatePreviewStarterPreset {
	id: string;
	label: string;
	description: string;
}

/** A file the engine would scaffold into the new workspace (path only — the
 * preview lists what is created, not the full body). */
export interface TemplatePreviewScaffoldFile {
	path: string;
}

/**
 * The computed dry-run plan: everything the create engine would produce for a
 * template, with nothing actually created.
 */
export interface TemplatePreviewPlan {
	templateId: string;
	templateName: string;
	description?: string;
	/** Derived project name (repo basename or preset/default name). */
	projectName: string;
	createMode: TemplatePreviewCreateMode;
	/** Present only for `clone-repo` templates. */
	repoUrl?: string;
	/** Starter presets that will be applied (empty for repo-only templates). */
	starterPresets: TemplatePreviewStarterPreset[];
	/** Files the engine will scaffold, de-duplicated in catalog order. */
	scaffoldFiles: TemplatePreviewScaffoldFile[];
	/** Setup commands the engine will append to `rox/config.json`. */
	setupCommands: string[];
	/**
	 * Starter ids that don't resolve to a catalog preset. Surfaced so the
	 * preview is honest about gaps instead of silently dropping them.
	 */
	unknownStarterPresetIds: string[];
}

/**
 * Derive the project name the engine would use for a repo template: the final
 * path segment of the URL, with query/hash, trailing slashes, and a `.git`
 * suffix stripped. Mirrors `deriveProjectNameFromUrl` in `TemplateGalleryModal`.
 */
export function deriveProjectNameFromRepoUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

/**
 * Compute the dry-run preview plan for a template. PURE: no I/O, no cloning, no
 * mutation — it only reads the template spec and the starter-preset catalog.
 */
export function deriveTemplatePreview(
	template: TemplatePreviewInput,
): TemplatePreviewPlan {
	const repoUrl = template.repo?.trim() ? template.repo.trim() : undefined;
	const createMode: TemplatePreviewCreateMode = repoUrl
		? "clone-repo"
		: "empty-git-workspace";

	const projectName = repoUrl
		? deriveProjectNameFromRepoUrl(repoUrl)
		: (template.defaultProjectName ?? template.id);

	const starterPresets: TemplatePreviewStarterPreset[] = [];
	const unknownStarterPresetIds: string[] = [];
	const scaffoldFiles: TemplatePreviewScaffoldFile[] = [];
	const setupCommands: string[] = [];
	const seenPaths = new Set<string>();
	const seenCommands = new Set<string>();

	for (const presetId of template.starterPresetIds ?? []) {
		const definition = getWorkspaceStarterPresetById(presetId);
		if (!definition) {
			unknownStarterPresetIds.push(presetId);
			continue;
		}
		starterPresets.push({
			id: definition.id,
			label: definition.label,
			description: definition.description,
		});

		const resolved = resolveWorkspaceStarterPreset(definition);
		if (!resolved) continue;
		for (const command of resolved.setupCommands) {
			if (seenCommands.has(command)) continue;
			seenCommands.add(command);
			setupCommands.push(command);
		}
		for (const file of resolved.scaffoldFiles) {
			if (seenPaths.has(file.path)) continue;
			seenPaths.add(file.path);
			scaffoldFiles.push({ path: file.path });
		}
	}

	return {
		templateId: template.id,
		templateName: template.name,
		...(template.description ? { description: template.description } : {}),
		projectName,
		createMode,
		...(repoUrl ? { repoUrl } : {}),
		starterPresets,
		scaffoldFiles,
		setupCommands,
		unknownStarterPresetIds,
	};
}

/**
 * Whether a template can actually be created (and therefore previewed
 * meaningfully): it either clones a repo or applies at least one starter preset.
 * Mirrors `isTemplateAvailable`/`isTemplateUsable` in the gallery + marketplace.
 */
export function isTemplatePreviewable(template: TemplatePreviewInput): boolean {
	return Boolean(template.repo) || Boolean(template.starterPresetIds?.length);
}
