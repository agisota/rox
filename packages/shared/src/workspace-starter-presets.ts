/**
 * Workspace STARTER presets — curated, opt-in bundles offered at workspace
 * creation. Where {@link WorkspaceSetupPreset} (in `workspace-setup-presets.ts`)
 * is a single-effect option (one command or one file), a starter is a named,
 * documented *bundle* of those options: "repo init + GitHub sync", "agent
 * context scaffold", "planning docs from template", "CI/CD autodeploy", and so
 * on.
 *
 * The Rox Starters template (the picker UI) shipped earlier; this catalog is the
 * preset *library* it draws from. Each starter is declared purely in terms of
 * existing `WORKSPACE_SETUP_PRESETS` ids, so a starter can never reference a
 * command or file that the single-effect catalog doesn't already define — the
 * two stay in lockstep and there is exactly one source of truth for the actual
 * commands/files.
 *
 * A resolved starter is itself a {@link WorkspaceSetupPreset}: selecting a
 * starter is equivalent to selecting every preset id it bundles, so the existing
 * config writer and `resolveWorkspaceSetupPresets` pipeline consume it unchanged.
 */

import {
	resolveWorkspaceSetupPresets,
	type WorkspaceScaffoldFile,
	type WorkspaceSetupPreset,
} from "./workspace-setup-presets";

/**
 * A named bundle of single-effect setup presets. `presetIds` are ids from
 * `WORKSPACE_SETUP_PRESETS`; the bundle scaffolds the union of their commands
 * and files (de-duplicated, in catalog order) when selected.
 */
export interface WorkspaceStarterPreset {
	id: string;
	label: string;
	description: string;
	/** Ids of the single-effect presets this starter bundles. */
	presetIds: readonly string[];
}

/**
 * The starter library. Each entry documents what it scaffolds; the concrete
 * commands/files live on the referenced single-effect presets.
 */
export const WORKSPACE_STARTER_PRESETS: readonly WorkspaceStarterPreset[] = [
	{
		id: "repo-init-github-sync",
		label: "Repo init + GitHub sync",
		description:
			"Initialize git, create a private GitHub repo, and keep the origin remote in sync.",
		presetIds: ["git-init", "github-repo-create", "github-sync"],
	},
	{
		id: "agents-md-generator",
		label: "AGENTS.md generator",
		description:
			"Scaffold an AGENTS.md agent guide alongside a starter README so agents and humans share context.",
		presetIds: ["agents-md", "readme"],
	},
	{
		id: "agent-context-scaffold",
		label: "Agent context scaffold",
		description:
			"Create the rox/, .agent/, and .memory/ directories that hold workspace config, agent artifacts, and persistent memory.",
		presetIds: ["rox-folder", "agent-folder", "memory-folder"],
	},
	{
		id: "planning-docs",
		label: "Planning docs from template",
		description:
			"Scaffold todo.md, spec.md, and a now/next/later planner.md to plan the work up front.",
		presetIds: ["todo-md", "spec-md", "planner-md"],
	},
	{
		id: "cicd-autodeploy",
		label: "CI/CD autodeploy scaffold",
		description:
			"Add a GitHub Actions deploy-on-push workflow plus a .gitignore so build artifacts stay out of the repo.",
		presetIds: ["ci-cd-deploy-on-commit", "gitignore"],
	},
	{
		id: "deep-wiki-cold-graph",
		label: "Deep-wiki + cold-graph init",
		description:
			"Build a deep wiki, precompute the cold dependency graph, and index symbols/docs for richer agent context.",
		presetIds: ["deep-wiki", "cold-graph", "understand-anything"],
	},
	{
		id: "open-source-baseline",
		label: "Open-source baseline",
		description:
			"Lay down the files an open-source repo expects: README, MIT LICENSE, .gitignore, and .editorconfig.",
		presetIds: ["readme", "license-mit", "gitignore", "editorconfig"],
	},
	{
		id: "everything",
		label: "Everything",
		description:
			"Run the full bootstrap: repo init + GitHub sync, agent context, planning docs, CI/CD, deep-wiki/cold-graph, and the open-source baseline.",
		presetIds: [
			"git-init",
			"github-repo-create",
			"github-sync",
			"agents-md",
			"rox-folder",
			"agent-folder",
			"memory-folder",
			"todo-md",
			"spec-md",
			"planner-md",
			"ci-cd-deploy-on-commit",
			"gitignore",
			"deep-wiki",
			"cold-graph",
			"understand-anything",
			"readme",
			"license-mit",
			"editorconfig",
		],
	},
	{
		id: "minimal-git",
		label: "Minimal git init",
		description: "Just initialize a fresh git repository — nothing else.",
		presetIds: ["git-init"],
	},
	{
		id: "agent-ready",
		label: "Agent-ready workspace",
		description:
			"Drop an AGENTS.md guide and the rox/, .agent/, and .memory/ directories so agents have context and scratch space from day one.",
		presetIds: ["agents-md", "rox-folder", "agent-folder", "memory-folder"],
	},
	{
		id: "prototyping",
		label: "Prototyping scratchpad",
		description:
			"Spin up a quick prototype: a README plus todo.md and spec.md to capture the idea while you build.",
		presetIds: ["readme", "todo-md", "spec-md"],
	},
	{
		id: "community-health",
		label: "Community health files",
		description:
			"Add the files a healthy open project expects: README, MIT LICENSE, and CONTRIBUTING.md.",
		presetIds: ["readme", "license-mit", "contributing"],
	},
	{
		id: "dockerized",
		label: "Dockerized",
		description:
			"Containerize the workspace: a starter Dockerfile plus a .dockerignore to keep the build context lean.",
		presetIds: ["dockerfile", "dockerignore"],
	},
	{
		id: "devcontainer-ready",
		label: "Dev container ready",
		description:
			"A reproducible dev environment: a .devcontainer config, a pinned Node version, and an .editorconfig.",
		presetIds: ["devcontainer", "nvmrc", "editorconfig"],
	},
	{
		id: "env-config",
		label: "Env config baseline",
		description:
			"Document required env vars in .env.example and add a .gitignore so real secrets never get committed.",
		presetIds: ["env-example", "gitignore"],
	},
];

/** Look up a starter by id. */
export function getWorkspaceStarterPresetById(
	id: string,
): WorkspaceStarterPreset | undefined {
	return WORKSPACE_STARTER_PRESETS.find((starter) => starter.id === id);
}

/**
 * Resolve a starter (by id or object) into the flat setup commands and scaffold
 * files it contributes, de-duplicated and in single-effect catalog order. The
 * result has the same shape returned by `resolveWorkspaceSetupPresets`.
 *
 * Returns `undefined` only when `starter` is an id that doesn't exist.
 */
export function resolveWorkspaceStarterPreset(
	starter: string | WorkspaceStarterPreset,
):
	| { setupCommands: string[]; scaffoldFiles: WorkspaceScaffoldFile[] }
	| undefined {
	const resolved =
		typeof starter === "string"
			? getWorkspaceStarterPresetById(starter)
			: starter;
	if (!resolved) return undefined;
	return resolveWorkspaceSetupPresets(resolved.presetIds);
}

/**
 * Present a starter as a single composite {@link WorkspaceSetupPreset}, so it can
 * flow through the same picker/config-writer pipeline as the single-effect
 * presets. Returns `undefined` for an unknown starter id.
 */
export function starterAsSetupPreset(
	starter: string | WorkspaceStarterPreset,
): WorkspaceSetupPreset | undefined {
	const resolved =
		typeof starter === "string"
			? getWorkspaceStarterPresetById(starter)
			: starter;
	if (!resolved) return undefined;
	const { setupCommands, scaffoldFiles } = resolveWorkspaceSetupPresets(
		resolved.presetIds,
	);
	return {
		id: resolved.id,
		label: resolved.label,
		description: resolved.description,
		...(setupCommands.length > 0 ? { setupCommands } : {}),
		...(scaffoldFiles.length > 0 ? { scaffoldFiles } : {}),
	};
}
