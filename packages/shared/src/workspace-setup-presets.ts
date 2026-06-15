/**
 * Workspace setup presets — the opt-in scaffolding/setup options offered when
 * creating or importing a workspace. Each preset maps to either shell setup
 * commands (run by `setup-terminal.ts` from the `rox/config.json` `setup`
 * array) and/or scaffold files written into the new workspace.
 *
 * This catalog is the single source of truth for both the picker UI
 * (`WorkspaceSetupPresets`) and the config writer. Keeping it in `@rox/shared`
 * lets the renderer and host-service agree on ids without a second source.
 */

/**
 * A file scaffolded into the workspace when a preset is selected. `path` is
 * relative to the workspace root; `contents` is the literal file body.
 */
export interface WorkspaceScaffoldFile {
	path: string;
	contents: string;
}

/**
 * One selectable setup option. `setupCommands` are appended to the
 * `rox/config.json` `setup` array (run once on workspace creation);
 * `scaffoldFiles` are written verbatim into the workspace.
 */
export interface WorkspaceSetupPreset {
	id: string;
	label: string;
	description: string;
	/** Shell commands appended to the `rox/config.json` setup array. */
	setupCommands?: string[];
	/** Files written into the workspace root on creation. */
	scaffoldFiles?: WorkspaceScaffoldFile[];
}

const AGENTS_MD_STUB = `# Agent Guide

Conventions and context for AI agents working in this repository.

## Structure

_Describe the project layout here._

## Commands

_List the common build/test/lint commands here._
`;

const TODO_MD_STUB = `# TODO

- [ ] First task
`;

const SPEC_MD_STUB = `# Spec

## Problem

## Approach

## Open questions
`;

const PLANNER_MD_STUB = `# Planner

## Now

## Next

## Later
`;

export const WORKSPACE_SETUP_PRESETS: readonly WorkspaceSetupPreset[] = [
	{
		id: "git-init",
		label: "Initialize git",
		description: "Run `git init` so the workspace is a fresh repository.",
		setupCommands: ["git init"],
	},
	{
		id: "github-repo-create",
		label: "Create GitHub repo",
		description:
			"Create a private GitHub repository and push the initial commit.",
		setupCommands: [
			'gh repo create "$(basename "$PWD")" --private --source=. --remote=origin --push',
		],
	},
	{
		id: "github-sync",
		label: "Sync with GitHub remote",
		description: "Set the origin remote and pull/push to keep it in sync.",
		setupCommands: ["git fetch origin", "git pull --ff-only || true"],
	},
	{
		id: "agents-md",
		label: "Add AGENTS.md",
		description: "Scaffold an AGENTS.md guide for AI agents.",
		scaffoldFiles: [{ path: "AGENTS.md", contents: AGENTS_MD_STUB }],
	},
	{
		id: "deep-wiki",
		label: "Generate deep wiki",
		description: "Build a deep wiki of the codebase for richer agent context.",
		setupCommands: ["rox wiki generate || true"],
	},
	{
		id: "cold-graph",
		label: "Build cold graph",
		description:
			"Precompute a cold dependency graph to understand the codebase.",
		setupCommands: ["rox graph build || true"],
	},
	{
		id: "understand-anything",
		label: "Understand anything",
		description: "Run the understand-anything pass to index symbols and docs.",
		setupCommands: ["rox understand || true"],
	},
	{
		id: "rox-folder",
		label: "Create rox folder",
		description: "Create the `rox/` workspace config directory.",
		setupCommands: ["mkdir -p rox"],
	},
	{
		id: "agent-folder",
		label: "Create .agent folder",
		description: "Create the `.agent/` directory for agent artifacts.",
		setupCommands: ["mkdir -p .agent"],
	},
	{
		id: "memory-folder",
		label: "Create .memory folder",
		description: "Create the `.memory/` directory for persistent memory.",
		setupCommands: ["mkdir -p .memory"],
	},
	{
		id: "ci-cd-deploy-on-commit",
		label: "CI/CD deploy on commit",
		description:
			"Add a GitHub Actions workflow that deploys on every push to main.",
		scaffoldFiles: [
			{
				path: ".github/workflows/deploy.yml",
				contents: `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Add your deploy step here"
`,
			},
		],
	},
	{
		id: "todo-md",
		label: "Add todo.md",
		description: "Scaffold a todo.md task list.",
		scaffoldFiles: [{ path: "todo.md", contents: TODO_MD_STUB }],
	},
	{
		id: "spec-md",
		label: "Add spec.md",
		description: "Scaffold a spec.md template.",
		scaffoldFiles: [{ path: "spec.md", contents: SPEC_MD_STUB }],
	},
	{
		id: "planner-md",
		label: "Add planner template",
		description: "Scaffold a planner.md with now/next/later sections.",
		scaffoldFiles: [{ path: "planner.md", contents: PLANNER_MD_STUB }],
	},
	{
		id: "gitignore",
		label: "Add .gitignore",
		description: "Scaffold a starter .gitignore for common artifacts.",
		scaffoldFiles: [
			{
				path: ".gitignore",
				contents: "node_modules/\ndist/\n.env\nrox/\n",
			},
		],
	},
	{
		id: "readme",
		label: "Add README.md",
		description: "Scaffold a starter README.md.",
		scaffoldFiles: [
			{
				path: "README.md",
				contents: "# Project\n\n_Describe your project._\n",
			},
		],
	},
	{
		id: "editorconfig",
		label: "Add .editorconfig",
		description: "Scaffold an .editorconfig for consistent formatting.",
		scaffoldFiles: [
			{
				path: ".editorconfig",
				contents:
					"root = true\n\n[*]\nindent_style = tab\nend_of_line = lf\ninsert_final_newline = true\n",
			},
		],
	},
	{
		id: "license-mit",
		label: "Add MIT license",
		description: "Scaffold an MIT LICENSE file.",
		scaffoldFiles: [
			{
				path: "LICENSE",
				contents: "MIT License\n\n_Fill in the year and copyright holder._\n",
			},
		],
	},
];

/** Look up a preset by id. */
export function getWorkspaceSetupPresetById(
	id: string,
): WorkspaceSetupPreset | undefined {
	return WORKSPACE_SETUP_PRESETS.find((preset) => preset.id === id);
}

/**
 * Resolve a list of selected preset ids into the flat setup commands and
 * scaffold files they contribute, de-duplicated and in catalog order.
 */
export function resolveWorkspaceSetupPresets(selectedIds: readonly string[]): {
	setupCommands: string[];
	scaffoldFiles: WorkspaceScaffoldFile[];
} {
	const selected = new Set(selectedIds);
	const setupCommands: string[] = [];
	const scaffoldFiles: WorkspaceScaffoldFile[] = [];
	const seenPaths = new Set<string>();

	for (const preset of WORKSPACE_SETUP_PRESETS) {
		if (!selected.has(preset.id)) continue;
		for (const command of preset.setupCommands ?? []) {
			if (!setupCommands.includes(command)) setupCommands.push(command);
		}
		for (const file of preset.scaffoldFiles ?? []) {
			if (seenPaths.has(file.path)) continue;
			seenPaths.add(file.path);
			scaffoldFiles.push(file);
		}
	}

	return { setupCommands, scaffoldFiles };
}
