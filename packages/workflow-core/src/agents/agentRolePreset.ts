/**
 * Agent-role presets for the Agent Pipelines layer.
 *
 * A "role" is a saved preset bundle (system prompt + model + skills + settings)
 * modeled as a `skills(kind="agent")` version. The bundle is persisted in the
 * `skill_versions.agentConfig` jsonb column (see `@rox/db`), which acts as the
 * implementation ref for `kind="agent"` skills.
 *
 * This is a pure type module — no React, no DB, no runtime side effects.
 */

/** How a role's agent is executed. */
export type AgentRoleKind =
	/** Rox in-process chat agent (ROX_AGENT_ID). */
	| "chat"
	/** Terminal CLI agent (claude / codex / …) in a git-worktree workspace. */
	| "terminal";

/** Tunables applied when an agent role runs. */
export interface AgentRoleSettings {
	/** Max agent turns before the node is forced to stop. */
	maxTurns?: number;
	/** Sampling temperature, when the model supports it. */
	temperature?: number;
	/** MCP server scope granted to this role. */
	mcpScope?: string[];
	/** Branch-name prefix for CLI agents' git worktrees. */
	worktreeBranchPrefix?: string;
}

/**
 * A saved agent-role preset. Stored on `skill_versions.agentConfig` for skills
 * whose `kind="agent"`.
 */
export interface AgentRolePreset {
	/** rox in-process vs CLI in a worktree. */
	agentKind: AgentRoleKind;
	/** ROX_AGENT_ID for chat, or a CLI id ("claude" / "codex" / …) for terminal. */
	agentId: string;
	/** chat-models id; defaults to ROX R1 when omitted. */
	model?: string;
	/** Role persona (RU-friendly) injected as the agent's system prompt. */
	systemPrompt: string;
	/** Skills granted to this role (skill slugs). */
	skillSlugs: string[];
	/** Execution tunables. */
	settings: AgentRoleSettings;
}

/** Slugs of the four built-in agent roles seeded per organization. */
export const BUILTIN_AGENT_ROLE_SLUGS = [
	"prompt-improver",
	"decomposer",
	"orchestrator",
	"critic",
] as const;

export type BuiltinAgentRoleSlug = (typeof BUILTIN_AGENT_ROLE_SLUGS)[number];
