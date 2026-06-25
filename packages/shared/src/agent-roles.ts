/**
 * Role-based model routing — the cross-platform core behind the onboarding
 * "agent team" screen (Ф4, #509) and consumed by the orchestrator runtime (Ф3,
 * #508).
 *
 * A real multi-role agent team has five roles. The orchestrator resolves which
 * role a dispatched step belongs to, then runs that step on the role's
 * configured `{ agentId, modelId }`. Every role defaults to the ROX agent + ROX
 * house model, so a zero-config install routes everything to ROX/ROX.
 *
 * This module is pure (no Node / DOM deps) so the same core is reused by the
 * desktop main process (host-service routing), the desktop renderer (the role
 * table UI), and any future web/mobile client.
 */

import { z } from "zod";
import { BUILTIN_AGENT_IDS, BUILTIN_AGENT_LABELS } from "./agent-catalog";
import { ROX_R1_MODEL_ID } from "./rox-models";

/** The five orchestration roles, in display order. */
export const AGENT_ROLES = [
	"orchestrator",
	"planning",
	"execution",
	"research",
	"review",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

/** Localized (RU) role names for the onboarding role table. */
export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
	orchestrator: "Оркестратор",
	planning: "Планирование",
	execution: "Исполнение",
	research: "Исследование",
	review: "Ревью",
};

/** One-line role descriptions for tooltips / secondary text. */
export const AGENT_ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
	orchestrator: "Распределяет шаги между ролями и сводит результат.",
	planning: "Разбивает задачу на план и подзадачи.",
	execution: "Пишет и меняет код по плану.",
	research: "Ищет контекст, изучает кодовую базу и документацию.",
	review: "Проверяет результат, ревью и верификация.",
};

/**
 * Sentinel agent id for a user-provided custom provider/agent. Real agent ids
 * come from the builtin catalog (`BUILTIN_AGENT_IDS`); this is the escape hatch
 * the onboarding dropdown offers as the last option.
 */
export const CUSTOM_AGENT_OPTION_ID = "custom";

/** ROX zero-config defaults: the house chat agent + the free house model. */
export const DEFAULT_ROLE_AGENT_ID = "rox";
export const DEFAULT_ROLE_MODEL_ID = ROX_R1_MODEL_ID;

export interface RoleAgentOption {
	id: string;
	label: string;
}

/**
 * Curated selectable agents for the onboarding role table (Variant A):
 * ROX (default), Claude Code, Codex, OpenCode, Groq, custom. Labels reuse the
 * builtin catalog (`BUILTIN_AGENT_LABELS`) where an id maps to a builtin agent,
 * so this list stays in sync with the rest of the agent wiring.
 */
export const ROLE_AGENT_OPTIONS: readonly RoleAgentOption[] = [
	{ id: DEFAULT_ROLE_AGENT_ID, label: "ROX" },
	{ id: "claude", label: BUILTIN_AGENT_LABELS.claude ?? "Claude Code" },
	{ id: "codex", label: BUILTIN_AGENT_LABELS.codex ?? "Codex" },
	{ id: "opencode", label: BUILTIN_AGENT_LABELS.opencode ?? "OpenCode" },
	{ id: "groq", label: "Groq" },
	{ id: CUSTOM_AGENT_OPTION_ID, label: "Свой провайдер" },
] as const;

/** True when `id` is a known builtin agent id (vs a custom/unknown id). */
export function isKnownAgentId(id: string): boolean {
	return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

/**
 * Sentinel modelId meaning "use this agent's own default model" — the value the
 * Model dropdown stores for any non-ROX agent, which the agent runtime resolves
 * to its built-in default at dispatch time.
 */
export const AGENT_DEFAULT_MODEL_ID = "default";

export interface RoleModelOption {
	value: string;
	label: string;
}

/**
 * Model options the onboarding Model dropdown offers for a given agent. ROX
 * exposes its free house model (preselected for the zero-config default); other
 * agents expose their own default until a richer per-agent model catalog is
 * wired in.
 */
export function modelOptionsForAgent(agentId: string): RoleModelOption[] {
	if (agentId === DEFAULT_ROLE_AGENT_ID) {
		return [{ value: DEFAULT_ROLE_MODEL_ID, label: "ROX R1" }];
	}
	return [{ value: AGENT_DEFAULT_MODEL_ID, label: "По умолчанию" }];
}

/** The modelId to select when an agent is chosen in the role table. */
export function defaultModelForAgent(agentId: string): string {
	return modelOptionsForAgent(agentId)[0]?.value ?? AGENT_DEFAULT_MODEL_ID;
}

/** A single role's resolved agent + model. */
export interface RoleModelSelection {
	agentId: string;
	modelId: string;
}

/** The full per-role mapping the orchestrator consumes. */
export type RoleModelMapping = Record<AgentRole, RoleModelSelection>;

/** The ROX/ROX default a fresh install resolves to for every role. */
export const DEFAULT_ROLE_MODEL_SELECTION: RoleModelSelection = {
	agentId: DEFAULT_ROLE_AGENT_ID,
	modelId: DEFAULT_ROLE_MODEL_ID,
};

/** A fresh mapping with every role defaulted to ROX/ROX. */
export function defaultRoleModelMapping(): RoleModelMapping {
	return Object.fromEntries(
		AGENT_ROLES.map((role) => [role, { ...DEFAULT_ROLE_MODEL_SELECTION }]),
	) as RoleModelMapping;
}

const selectionSchema = z.object({
	agentId: z.string().min(1),
	modelId: z.string().min(1),
});

/**
 * A partial mapping schema — any subset of roles may be present (an upgrader
 * who only ever configured one role still parses). Missing roles fall back to
 * the ROX/ROX default in {@link parseRoleModelMapping}.
 */
const partialMappingSchema = z.object({
	orchestrator: selectionSchema.optional(),
	planning: selectionSchema.optional(),
	execution: selectionSchema.optional(),
	research: selectionSchema.optional(),
	review: selectionSchema.optional(),
});

/**
 * Normalize any stored value (a JSON string, a parsed object, null, or
 * garbage) into a complete {@link RoleModelMapping}. Unknown/missing roles and
 * invalid payloads collapse to the ROX/ROX default rather than throwing, so a
 * corrupt setting can never brick routing.
 */
export function parseRoleModelMapping(raw: unknown): RoleModelMapping {
	const base = defaultRoleModelMapping();
	if (raw == null) return base;

	let candidate: unknown = raw;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (trimmed === "") return base;
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			return base;
		}
	}

	const parsed = partialMappingSchema.safeParse(candidate);
	if (!parsed.success) return base;

	for (const role of AGENT_ROLES) {
		const selection = parsed.data[role];
		if (selection) {
			base[role] = { agentId: selection.agentId, modelId: selection.modelId };
		}
	}
	return base;
}

/** Serialize a mapping for storage (the host-service settings JSON column). */
export function serializeRoleModelMapping(mapping: RoleModelMapping): string {
	return JSON.stringify(mapping);
}

/**
 * A free-text orchestration step kind. The orchestrator labels each dispatched
 * step (e.g. "plan", "execute", "research", "review", or a phrase like
 * "implement the parser"); {@link resolveRoleForStep} maps it to a role.
 */
export type OrchestrationStepKind = string;

const STEP_ROLE_RULES: ReadonlyArray<readonly [RegExp, AgentRole]> = [
	[/\b(plan|planning|design|spec|breakdown|estimate|scope)\b/i, "planning"],
	[
		/\b(execut|implement|code|coding|build|write|edit|fix|refactor|apply|patch)\b/i,
		"execution",
	],
	[
		/\b(research|explore|investigat|search|discover|gather|analyz|read)\b/i,
		"research",
	],
	[/\b(review|verif|critique|qa|audit|inspect|test)\b/i, "review"],
	[/\b(orchestrat|dispatch|coordinat|route|delegate)\b/i, "orchestrator"],
];

/**
 * Resolve which role a dispatched step belongs to. An exact role name wins
 * (case-insensitive); otherwise keyword rules classify the step; anything
 * unrecognized routes to the orchestrator (the safe catch-all).
 */
export function resolveRoleForStep(stepKind: OrchestrationStepKind): AgentRole {
	const normalized = stepKind.trim().toLowerCase();
	if ((AGENT_ROLES as readonly string[]).includes(normalized)) {
		return normalized as AgentRole;
	}
	for (const [pattern, role] of STEP_ROLE_RULES) {
		if (pattern.test(stepKind)) return role;
	}
	return "orchestrator";
}

/**
 * The agent+model a given role resolves to. An unconfigured role (or a null
 * mapping) falls back to ROX/ROX.
 */
export function resolveSelectionForRole(
	role: AgentRole,
	mapping?: RoleModelMapping | null,
): RoleModelSelection {
	if (!mapping) return { ...DEFAULT_ROLE_MODEL_SELECTION };
	return mapping[role] ?? { ...DEFAULT_ROLE_MODEL_SELECTION };
}

/**
 * Runtime routing entrypoint: given a step kind and the configured mapping,
 * return the agent+model to dispatch the step on. This is what the orchestrator
 * calls at the agent-run boundary instead of reading a single global model.
 */
export function selectModelForStep(
	stepKind: OrchestrationStepKind,
	mapping?: RoleModelMapping | null,
): RoleModelSelection {
	return resolveSelectionForRole(resolveRoleForStep(stepKind), mapping);
}
