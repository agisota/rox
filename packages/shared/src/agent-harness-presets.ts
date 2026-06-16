import { BUILTIN_TERMINAL_AGENT_TYPES } from "./builtin-terminal-agents";

/**
 * Harness install platforms, mirroring `process.platform` for the three
 * desktop targets Rox ships to.
 */
export type HarnessInstallPlatform = "darwin" | "linux" | "win32";

/**
 * A config file the harness drops into place after install. `path` is
 * resolved relative to the user's home directory; `templateRef` is the key
 * into the host-service `config-templates` map that holds the file body.
 * Keeping the body out of this catalog avoids shipping large template
 * literals through the shared package.
 */
export interface HarnessConfigFile {
	path: string;
	templateRef: string;
	/**
	 * `true` by default. Set to `false` for additive user-level configs that
	 * must not clobber an existing hand-written file.
	 */
	overwrite?: boolean;
}

/**
 * One ordered install step. `platforms` scopes the step to specific OSes;
 * omit it to run on every platform.
 */
export interface HarnessInstallStep {
	command: string;
	platforms?: HarnessInstallPlatform[];
}

export type HarnessInstallSource = "npm" | "manual" | "unknown";
export type HarnessInstallerSizeRisk = "low" | "medium" | "unknown";
export type HarnessTerminalPresetStrategy = "base-agent" | "unsupported";

/**
 * Review receipt for release-train gating. This is deliberately small and
 * static: it records what Rox can honestly claim about a harness without
 * shelling out or depending on the user's local package-manager cache.
 */
export interface HarnessAuditReceipt {
	source: HarnessInstallSource;
	/** SPDX id when known from the upstream package; "unknown" otherwise. */
	license: string;
	sizeRisk: HarnessInstallerSizeRisk;
	terminalPresetStrategy: HarnessTerminalPresetStrategy;
	notes: string;
}

/**
 * A harness is a configuration layer (commands + dropped config files) that
 * sits on top of one base terminal agent — e.g. `oh-my-claudecode` configures
 * `claude`. Harnesses without a verified install command are marked
 * `optional` and are install-on-request only.
 */
export interface AgentHarnessPreset {
	id: string;
	label: string;
	description: string;
	/** The base terminal agent id this harness configures. */
	baseAgentId: string;
	/** Ordered install steps. Empty when no verified install path exists. */
	install: HarnessInstallStep[];
	/** Config files dropped into place after a successful install. */
	configFiles: HarnessConfigFile[];
	/** True when there is no verified install command (install on request). */
	optional?: boolean;
	audit: HarnessAuditReceipt;
}

const BASE_AGENT_IDS: ReadonlySet<string> = new Set(
	BUILTIN_TERMINAL_AGENT_TYPES,
);

export const ODW_OMP_HARNESS_ID = "open-dynamic-workflows-omp" as const;

export const AGENT_HARNESS_PRESETS: readonly AgentHarnessPreset[] = [
	{
		id: "oh-my-claudecode",
		label: "Oh My ClaudeCode",
		description:
			"Skill, command, and hook bundle that supercharges Claude Code workflows.",
		baseAgentId: "claude",
		install: [{ command: "npx -y oh-my-claudecode@latest install --global" }],
		configFiles: [],
		audit: {
			source: "npm",
			license: "MIT",
			sizeRisk: "medium",
			terminalPresetStrategy: "base-agent",
			notes:
				"Local package manifest ships multiple runtime deps and native sqlite; terminal presets should link to the Claude base agent config.",
		},
	},
	{
		id: "oh-my-codex",
		label: "Oh My Codex",
		description: "Codex companion skills, commands, and prompt pipelines.",
		baseAgentId: "codex",
		install: [{ command: "npx -y oh-my-codex@latest install --global" }],
		configFiles: [],
		audit: {
			source: "npm",
			license: "MIT",
			sizeRisk: "low",
			terminalPresetStrategy: "base-agent",
			notes:
				"Local package manifest has a small dependency set; terminal presets should link to the Codex base agent config.",
		},
	},
	{
		id: "rox",
		label: "Rox",
		description:
			"Default Rox harness layer for the built-in terminal coding agent.",
		baseAgentId: "omp",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "manual",
			license: "MIT",
			sizeRisk: "low",
			terminalPresetStrategy: "base-agent",
			notes:
				"Bundled Rox harness is represented by the OMP base terminal agent and does not need a separate installer.",
		},
	},
	{
		id: ODW_OMP_HARNESS_ID,
		label: "Open Dynamic Workflows + Rox",
		description:
			"Optional workflow orchestration layer for running dynamic workflow scripts through Rox without replacing the base omp launch path.",
		baseAgentId: "omp",
		install: [{ command: "npm install -g open-dynamic-workflows@latest" }],
		configFiles: [
			{
				path: ".config/odw/config.json",
				templateRef: "open-dynamic-workflows-omp",
				overwrite: false,
			},
		],
		optional: true,
		audit: {
			source: "npm",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"Optional install-on-request workflow harness; terminal presets should link to the OMP base agent config.",
		},
	},
	{
		id: "oh-my-openagent",
		label: "Oh My OpenAgent",
		description: "Harness bundle for open-source terminal agents.",
		baseAgentId: "opencode",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "unknown",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"No verified installer in this branch; terminal presets can only target the OpenCode base agent config.",
		},
	},
	{
		id: "hermes",
		label: "Hermes",
		description: "Workflow harness for orchestrating multi-step agent tasks.",
		baseAgentId: "claude",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "unknown",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"No verified installer in this branch; terminal presets can only target the Claude base agent config.",
		},
	},
	{
		id: "openclaw",
		label: "OpenClaw",
		description: "Persona and skill harness layered on Claude Code.",
		baseAgentId: "claude",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "unknown",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"No verified installer in this branch; terminal presets can only target the Claude base agent config.",
		},
	},
	{
		id: "ouroboros",
		label: "Ouroboros",
		description: "Self-improving autonomous loop harness for terminal agents.",
		baseAgentId: "codex",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "unknown",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"No verified installer in this branch; terminal presets can only target the Codex base agent config.",
		},
	},
	{
		id: "kiro",
		label: "Kiro",
		description: "Spec-driven development harness for terminal coding agents.",
		baseAgentId: "claude",
		install: [],
		configFiles: [],
		optional: true,
		audit: {
			source: "unknown",
			license: "unknown",
			sizeRisk: "unknown",
			terminalPresetStrategy: "base-agent",
			notes:
				"No verified installer in this branch; terminal presets can only target the Claude base agent config.",
		},
	},
] as const;

export function getHarnessPresetById(
	id: string,
): AgentHarnessPreset | undefined {
	return AGENT_HARNESS_PRESETS.find((preset) => preset.id === id);
}

/** Harnesses with a verified, non-empty install path (safe to auto-run). */
export function getInstallableHarnessPresets(): AgentHarnessPreset[] {
	return AGENT_HARNESS_PRESETS.filter(
		(preset) => !preset.optional && preset.install.length > 0,
	);
}

/** True when every harness points at a base agent that exists in the catalog. */
export function harnessBaseAgentsAreValid(): boolean {
	return AGENT_HARNESS_PRESETS.every((preset) =>
		BASE_AGENT_IDS.has(preset.baseAgentId),
	);
}

export function getHarnessTerminalPresetBaseAgentIds(): Record<string, string> {
	return Object.fromEntries(
		AGENT_HARNESS_PRESETS.filter(
			(preset) => preset.audit.terminalPresetStrategy === "base-agent",
		).map((preset) => [preset.id, preset.baseAgentId]),
	);
}
