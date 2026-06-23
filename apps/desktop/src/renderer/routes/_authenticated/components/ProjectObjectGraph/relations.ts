import type { EdgeRelation } from "@rox/db/enums";

/**
 * Project OS (#01, Phase-1) — the edge relations a user can create from the
 * object-details Link Picker. A curated, human-meaningful subset of the core
 * `edgeRelationValues`; the wikilink/tag/identity relations (`links_to`,
 * `tagged_with`, `authored_by`, …) are owned by the graph-service writers and
 * are intentionally NOT user-pickable here.
 */
export interface RelationOption {
	value: EdgeRelation;
	label: string;
}

export const LINKABLE_RELATIONS: readonly RelationOption[] = [
	{ value: "references", label: "Ссылается на" },
	{ value: "blocks", label: "Блокирует" },
	{ value: "child_of", label: "Дочерний для" },
	{ value: "about", label: "О (about)" },
	{ value: "mentions", label: "Упоминает" },
	{ value: "attached_to", label: "Прикреплён к" },
] as const;

/** Human label for a relation (falls back to the raw enum value). */
export function relationLabel(relation: EdgeRelation): string {
	return (
		LINKABLE_RELATIONS.find((r) => r.value === relation)?.label ?? relation
	);
}

/** Human label for an entity kind (Russian UI), falls back to the raw kind. */
const ENTITY_KIND_LABELS: Partial<Record<string, string>> = {
	note: "Заметка",
	task: "Задача",
	project: "Проект",
	area: "Область",
	contact: "Контакт",
	calendar_event: "Событие",
	agent_session: "Сессия агента",
	file: "Файл",
	design_artifact: "Дизайн-артефакт",
	email: "Письмо",
	message: "Сообщение",
	journal: "Журнал",
	tag: "Тег",
};

export function entityKindLabel(kind: string): string {
	return ENTITY_KIND_LABELS[kind] ?? kind;
}
