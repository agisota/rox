import { z } from "zod";

/**
 * Workspace governance items: ЦЕЛИ (goals), ЗАДАЧИ (tasks), МИССИИ (missions).
 *
 * These power the right-panel "Управление" section in the v2 workspace. Each
 * row is keyed by its own `id` and scoped to a workspace via `workspaceId`
 * (indexed) so the section can live-query just its workspace's items.
 *
 * Persistence note (TODO(server)): there is no Electric/host-service collection
 * for governance items yet, so this is a typed localStorage-backed collection
 * following the same project-native pattern as `v2TerminalPresets` /
 * `v2SidebarSections`. When a backend collection lands, swap the collection
 * factory in `collections.ts` to an `electricCollectionOptions(...)` shape and
 * keep this schema as the row contract.
 */
export const governanceKindSchema = z.enum(["goal", "task", "mission"]);

export type GovernanceKind = z.infer<typeof governanceKindSchema>;

const persistedDateSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (typeof value === "string" ? new Date(value) : value));

export const workspaceGovernanceItemSchema = z.object({
	id: z.string(),
	workspaceId: z.string().uuid(),
	kind: governanceKindSchema,
	text: z.string().trim().min(1),
	/** Sort order within (workspaceId, kind); lower renders first. */
	order: z.number().int().default(0),
	createdAt: persistedDateSchema,
});

export type WorkspaceGovernanceItemRow = z.infer<
	typeof workspaceGovernanceItemSchema
>;

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
