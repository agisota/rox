import { db, dbWs } from "@rox/db/client";
import {
	type SelectSkill,
	type SelectSkillVersion,
	skills,
	skillVersions,
} from "@rox/db/schema";
import {
	type AgentRolePreset,
	BUILTIN_AGENT_ROLE_SLUGS,
	type BuiltinAgentRoleSlug,
} from "@rox/workflow-core";
import { and, eq, isNull } from "drizzle-orm";

/**
 * The four built-in agent-role templates seeded per organization. Each is a
 * `skills(kind="agent")` row whose `skill_versions.agentConfig` carries the
 * preset bundle (system prompt + model + skills + settings).
 *
 * Personas are RU-localized to match the Set product language. All four default
 * to the in-process Rox chat agent (`agentKind="chat"`, `agentId="rox"`); the
 * canvas can swap any of them to a terminal CLI agent later.
 */
interface BuiltinRoleTemplate {
	slug: BuiltinAgentRoleSlug;
	name: string;
	description: string;
	preset: AgentRolePreset;
}

const ROX_CHAT_AGENT_ID = "rox";

export const BUILTIN_ROLE_TEMPLATES: readonly BuiltinRoleTemplate[] = [
	{
		slug: "prompt-improver",
		name: "Улучшатель промптов",
		description:
			"Переписывает и уточняет входной запрос: дефицит → выбор, абстракция → механизм.",
		preset: {
			agentKind: "chat",
			agentId: ROX_CHAT_AGENT_ID,
			systemPrompt:
				"Ты — улучшатель промптов. Переформулируй входной запрос так, чтобы он стал конкретным, измеримым и исполнимым: добавь допущения, границы, критерий готовности. Верни только улучшенный промпт.",
			skillSlugs: [],
			settings: { maxTurns: 1 },
		},
	},
	{
		slug: "decomposer",
		name: "Декомпозитор",
		description:
			"Разбивает задачу на независимые подзадачи с целью, артефактом и done-критерием.",
		preset: {
			agentKind: "chat",
			agentId: ROX_CHAT_AGENT_ID,
			systemPrompt:
				"Ты — декомпозитор. Разбей задачу на 3–7 независимых подзадач. Для каждой укажи цель, артефакт и критерий готовности. Верни структурированный список.",
			skillSlugs: [],
			settings: { maxTurns: 1 },
		},
	},
	{
		slug: "orchestrator",
		name: "Оркестратор",
		description:
			"Координирует выполнение подзадач, собирает результаты и синтезирует итог.",
		preset: {
			agentKind: "chat",
			agentId: ROX_CHAT_AGENT_ID,
			systemPrompt:
				"Ты — оркестратор. Координируй выполнение подзадач, отслеживай зависимости, собирай результаты исполнителей и синтезируй цельный итог. Опирайся на предоставленный транскрипт.",
			skillSlugs: [],
			settings: { maxTurns: 8 },
		},
	},
	{
		slug: "critic",
		name: "Критик",
		description:
			"Адверсариально проверяет результат и выдаёт вердикт approved / needs_work.",
		preset: {
			agentKind: "chat",
			agentId: ROX_CHAT_AGENT_ID,
			systemPrompt:
				"Ты — критик. Адверсариально проверь результат на корректность, полноту и соответствие задаче. Заверши ответ ровно одним из вердиктов: 'approved' или 'needs_work' с кратким обоснованием.",
			skillSlugs: [],
			settings: { maxTurns: 1 },
		},
	},
] as const;

export type AgentRoleWithVersion = {
	skill: SelectSkill;
	version: SelectSkillVersion | null;
};

/**
 * List the org's agent-role skills (`kind="agent"`), optionally project-scoped,
 * joined with their current version (carrying the `agentConfig` preset).
 */
export async function listAgentRoles(
	organizationId: string,
	v2ProjectId?: string,
): Promise<AgentRoleWithVersion[]> {
	const conditions = [
		eq(skills.organizationId, organizationId),
		eq(skills.kind, "agent"),
	];
	if (v2ProjectId) {
		conditions.push(eq(skills.v2ProjectId, v2ProjectId));
	}
	const rows = await db
		.select()
		.from(skills)
		.leftJoin(skillVersions, eq(skills.currentVersionId, skillVersions.id))
		.where(and(...conditions));
	return rows.map((r) => ({ skill: r.skills, version: r.skill_versions }));
}

/**
 * Idempotently seed the four built-in agent-role templates for an org (and an
 * optional project scope). Existing roles (matched by slug within the same
 * org+project scope) are left untouched. Returns all built-in roles after
 * seeding. Uses `dbWs` because seeding writes a small graph of rows.
 */
export async function seedBuiltinRoles(
	organizationId: string,
	ownerUserId: string,
	v2ProjectId: string | null,
): Promise<AgentRoleWithVersion[]> {
	// Which built-in slugs already exist in this scope?
	const scopeCondition = v2ProjectId
		? eq(skills.v2ProjectId, v2ProjectId)
		: isNull(skills.v2ProjectId);
	const existing = await db
		.select({ id: skills.id, slug: skills.slug })
		.from(skills)
		.where(
			and(
				eq(skills.organizationId, organizationId),
				eq(skills.kind, "agent"),
				scopeCondition,
			),
		);
	const existingSlugs = new Set(existing.map((e) => e.slug));

	const missing = BUILTIN_ROLE_TEMPLATES.filter(
		(t) => !existingSlugs.has(t.slug),
	);

	for (const template of missing) {
		await dbWs.transaction(async (tx) => {
			const [skill] = await tx
				.insert(skills)
				.values({
					organizationId,
					v2ProjectId,
					ownerUserId,
					slug: template.slug,
					name: template.name,
					description: template.description,
					kind: "agent",
					status: "published",
					visibility: "organization",
				})
				.returning();
			if (!skill) return;
			const [version] = await tx
				.insert(skillVersions)
				.values({
					skillId: skill.id,
					organizationId,
					versionNumber: 1,
					inputSchema: {},
					outputSchema: {},
					// agentConfig IS the implementation ref for kind="agent".
					agentConfig: template.preset,
					runModes: ["workflow_node"],
					createdByUserId: ownerUserId,
				})
				.returning();
			if (!version) return;
			await tx
				.update(skills)
				.set({ currentVersionId: version.id })
				.where(eq(skills.id, skill.id));
		});
	}

	return listAgentRoles(organizationId, v2ProjectId ?? undefined).then(
		(roles) =>
			roles.filter((r) =>
				(BUILTIN_AGENT_ROLE_SLUGS as readonly string[]).includes(r.skill.slug),
			),
	);
}
