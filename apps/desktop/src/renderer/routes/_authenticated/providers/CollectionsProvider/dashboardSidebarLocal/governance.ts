import type { SelectWorkspaceGovernanceItem } from "@rox/db/schema";
import { z } from "zod";

/**
 * Workspace governance items: ЦЕЛИ (goals), ЗАДАЧИ (tasks), МИССИИ (missions).
 *
 * These power the right-panel "Управление" section in the v2 workspace. Each
 * row is keyed by its own `id` and scoped to a workspace via `v2WorkspaceId`
 * (indexed) so the section can live-query just its workspace's items.
 *
 * Persistence (#517): governance items are org-scoped Postgres rows synced
 * through the electric-proxy (table `workspace_governance_items`) and mutated
 * via the `governance` tRPC router — the collection factory in `collections.ts`
 * is an `electricCollectionOptions(...)` shape with onInsert/onUpdate/onDelete.
 * The row contract is therefore the DB-inferred `SelectWorkspaceGovernanceItem`
 * (snake→camel via the Electric column mapper), aliased here so the panel's
 * components keep a single stable row type name.
 */
export const governanceKindSchema = z.enum(["goal", "task", "mission"]);

export type GovernanceKind = z.infer<typeof governanceKindSchema>;

/** Row contract for the "Управление" panel — the Electric-synced DB row. */
export type WorkspaceGovernanceItemRow = SelectWorkspaceGovernanceItem;

export const GOVERNANCE_KINDS: readonly GovernanceKind[] = [
	"goal",
	"task",
	"mission",
];

interface GovernanceKindMeta {
	/** Section heading (RU, uppercase). */
	label: string;
	/** Singular noun used in placeholders/empty states (RU). */
	noun: string;
	/**
	 * Verb-phrase that frames the item text into a launch prompt for a fresh
	 * chat-branch. The item text is appended after this.
	 */
	executePrefix: string;
}

export const GOVERNANCE_KIND_META: Record<GovernanceKind, GovernanceKindMeta> =
	{
		goal: {
			label: "ЦЕЛИ",
			noun: "цель",
			executePrefix: "Выполни эту цель",
		},
		task: {
			label: "ЗАДАЧИ",
			noun: "задачу",
			executePrefix: "Выполни эту задачу",
		},
		mission: {
			label: "МИССИИ",
			noun: "миссию",
			executePrefix: "Выполни эту миссию",
		},
	};

/**
 * Frames a governance item's text as an execution prompt for a new chat-branch.
 * Mirrors the PR-flow's "dispatch a slash-command + context" convention but for
 * a free-form goal/task/mission.
 */
export function buildGovernanceExecutePrompt(
	kind: GovernanceKind,
	text: string,
): string {
	const meta = GOVERNANCE_KIND_META[kind];
	return `${meta.executePrefix}:\n\n${text.trim()}`;
}

/**
 * Frames a governance item's text as a discussion prompt (no branching / no
 * execution framing) — used by the secondary "Обсудить с AI" action.
 */
export function buildGovernanceDiscussPrompt(
	kind: GovernanceKind,
	text: string,
): string {
	const meta = GOVERNANCE_KIND_META[kind];
	return `Давай обсудим эту ${meta.noun}:\n\n${text.trim()}`;
}
