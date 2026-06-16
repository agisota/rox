import {
	createTerminalAgentDefinition,
	type TerminalAgentDefinition,
	type TerminalAgentDefinitionInput,
} from "./agent-definition";
import type { PromptTransport } from "./agent-prompt-launch";
import { DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE } from "./agent-prompt-template";

interface BuiltinTerminalAgentManifest
	extends Omit<
		TerminalAgentDefinitionInput,
		"source" | "kind" | "enabled" | "taskPromptTemplate"
	> {
	description: string;
	includeInDefaultTerminalPresets?: boolean;
}

export interface BuiltinTerminalAgentDefinition
	extends TerminalAgentDefinition {
	description: string;
	includeInDefaultTerminalPresets?: boolean;
}

type AgentIdTuple<T extends readonly { id: string }[]> = {
	[K in keyof T]: T[K] extends { id: infer TId } ? TId : never;
};

function mapAgentIds<const T extends readonly { id: string }[]>(
	agents: T,
): AgentIdTuple<T> {
	return agents.map((agent) => agent.id) as AgentIdTuple<T>;
}

function createAgentRecord<const T extends readonly { id: string }[], TValue>(
	agents: T,
	getValue: (agent: T[number]) => TValue,
): Record<T[number]["id"], TValue> {
	return Object.fromEntries(
		agents.map((agent) => [agent.id, getValue(agent)]),
	) as Record<T[number]["id"], TValue>;
}

function createBuiltinTerminalAgent<
	const T extends BuiltinTerminalAgentManifest,
>(manifest: T): BuiltinTerminalAgentDefinition & { id: T["id"] } {
	return {
		...createTerminalAgentDefinition({
			...manifest,
			source: "builtin",
			kind: "terminal",
			enabled: true,
			taskPromptTemplate: DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		}),
		description: manifest.description,
		includeInDefaultTerminalPresets: manifest.includeInDefaultTerminalPresets,
	};
}

export const BUILTIN_TERMINAL_AGENTS = [
	createBuiltinTerminalAgent({
		id: "omp",
		label: "Rox",
		description:
			"Rox's default coding agent with IDE-aware tools, subagents, LSP, DAP, and workflow-friendly prompt runs.",
		command: "omp --auto-approve",
		promptCommand: "omp --auto-approve -p",
		includeInDefaultTerminalPresets: true,
		install: {
			checkCommand: "omp --version",
			installCommand: "curl -fsSL https://omp.sh/install | sh",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "acpx",
		label: "ACPX",
		description:
			"Agent Client Protocol runner for launching ACP-compatible coding agents from Rox.",
		command: "acpx --approve-all pi",
		promptCommand: "acpx --approve-all pi",
		includeInDefaultTerminalPresets: true,
		install: {
			checkCommand: "acpx --version",
			installCommand: "npm install -g acpx@latest",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "claude",
		label: "Claude",
		description:
			"Anthropic's coding agent for reading code, editing files, and running terminal workflows.",
		command: "claude --dangerously-skip-permissions",
		includeInDefaultTerminalPresets: true,
		install: {
			checkCommand: "claude --version",
			installCommand: "npm install -g @anthropic-ai/claude-code@latest",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "amp",
		label: "Amp",
		description:
			"Amp's coding agent for terminal-first coding, subagents, and task work.",
		command: "amp",
		promptTransport: "stdin",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "codex",
		label: "Codex",
		description:
			"OpenAI's coding agent for reading, modifying, and running code across tasks.",
		command: "codex --dangerously-bypass-approvals-and-sandbox",
		promptCommand: "codex --dangerously-bypass-approvals-and-sandbox --",
		includeInDefaultTerminalPresets: true,
		install: {
			checkCommand: "codex --version",
			installCommand: "npm install -g @openai/codex@latest",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "gemini",
		label: "Gemini",
		description:
			"Google's open-source terminal agent for coding, problem-solving, and task work.",
		command: "gemini --approval-mode=auto_edit",
		promptCommand: "gemini --approval-mode=auto_edit",
		includeInDefaultTerminalPresets: true,
		install: {
			checkCommand: "gemini --version",
			installCommand: "npm install -g @google/gemini-cli@latest",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "mastracode",
		label: "Mastracode",
		description:
			"Mastra's coding agent for building, debugging, and shipping code from the terminal.",
		command: "mastracode",
		promptCommand: "mastracode --prompt",
		promptCommandSuffix: "; mastracode",
	}),
	createBuiltinTerminalAgent({
		id: "opencode",
		label: "OpenCode",
		description: "Open-source coding agent for the terminal, IDE, and desktop.",
		command: "opencode",
		promptCommand: "opencode --prompt",
	}),
	createBuiltinTerminalAgent({
		id: "pi",
		label: "Pi",
		description:
			"Minimal terminal coding harness for flexible coding workflows.",
		command: "pi",
	}),
	createBuiltinTerminalAgent({
		id: "copilot",
		label: "Copilot",
		description:
			"GitHub's coding agent for planning, editing, and building in your repo.",
		command: "copilot --allow-tool=write",
		promptCommand: "copilot --allow-tool=write -i",
		includeInDefaultTerminalPresets: true,
	}),
	createBuiltinTerminalAgent({
		id: "cursor-agent",
		label: "Cursor Agent",
		description:
			"Cursor's coding agent for editing, running, and debugging code in parallel.",
		command: "cursor-agent",
	}),
	createBuiltinTerminalAgent({
		id: "droid",
		label: "Droid",
		description: "Factory's autonomous coding agent for terminal workflows.",
		command: "droid",
		install: {
			checkCommand: "droid --version",
			installCommand: "curl -fsSL https://app.factory.ai/cli | sh",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "kimi",
		label: "Kimi",
		description:
			"Moonshot's Kimi coding agent for terminal-first coding and task work.",
		command: "kimi",
		install: {
			checkCommand: "kimi --version",
			installCommand: "npm install -g @moonshot-ai/kimi-cli@1.0.0",
			updateStrategy: "pinned",
			pinnedVersion: "1.0.0",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "qwen",
		label: "Qwen Code",
		description:
			"Alibaba's Qwen Code agent for reading, editing, and running code.",
		command: "qwen",
		promptCommand: "qwen --prompt",
		install: {
			checkCommand: "qwen --version",
			installCommand: "npm install -g @qwen-code/qwen-code@latest",
			updateStrategy: "latest",
		},
	}),
	createBuiltinTerminalAgent({
		id: "grok",
		label: "Grok",
		description: "xAI's Grok coding agent for terminal coding workflows.",
		command: "grok",
		install: {
			checkCommand: "command -v grok",
			installCommand: "npm install -g @vibe-kit/grok-cli",
			updateStrategy: "latest",
			optional: true,
		},
	}),
	createBuiltinTerminalAgent({
		id: "trae",
		label: "Trae",
		description: "ByteDance's Trae coding agent for autonomous terminal tasks.",
		command: "trae",
		install: {
			checkCommand: "command -v trae",
			installCommand: "npm install -g @trae-ai/trae-cli",
			updateStrategy: "latest",
			optional: true,
		},
	}),
] as const;

export type BuiltinTerminalAgentType =
	(typeof BUILTIN_TERMINAL_AGENTS)[number]["id"];

export const DEFAULT_TERMINAL_AGENT_TYPE =
	"omp" satisfies BuiltinTerminalAgentType;

export const LEGACY_FALLBACK_TERMINAL_AGENT_TYPE =
	"claude" satisfies BuiltinTerminalAgentType;

export const BUILTIN_TERMINAL_AGENT_TYPES = mapAgentIds(
	BUILTIN_TERMINAL_AGENTS,
);

export const BUILTIN_TERMINAL_AGENT_LABELS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => agent.label,
);

export const BUILTIN_TERMINAL_AGENT_DESCRIPTIONS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => agent.description,
);

export const BUILTIN_TERMINAL_AGENT_COMMANDS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(agent) => [agent.command],
);

export const BUILTIN_TERMINAL_AGENT_PROMPT_COMMANDS = createAgentRecord(
	BUILTIN_TERMINAL_AGENTS,
	(
		agent,
	): {
		command: string;
		suffix?: string;
		transport: PromptTransport;
	} => ({
		command: agent.promptCommand,
		suffix: agent.promptCommandSuffix,
		transport: agent.promptTransport,
	}),
);

export const DEFAULT_TERMINAL_PRESET_AGENT_TYPES =
	BUILTIN_TERMINAL_AGENTS.filter(
		(agent) => agent.includeInDefaultTerminalPresets,
	).map((agent) => agent.id) satisfies BuiltinTerminalAgentType[];
