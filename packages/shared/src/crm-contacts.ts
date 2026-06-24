/**
 * Pure presentation + navigation helpers for the CRM contacts surface
 * (`projectOs.crmContacts`). Maps a `graph.listContacts` row to a render-ready
 * contact card view model (best-effort display name, subtitle, avatar initials,
 * `mailto:` action) and maps a contact's `graph.neighbors` result to its linked
 * objects (each labelled, optionally `rox://` deep-linkable). Dependency-free (no
 * React, no tRPC) so the web AND desktop panels stay thin render layers and this
 * mapping is the single, unit-tested source of truth shared by both surfaces.
 */

/**
 * The entity kinds a contact's neighbors can be, mirrored from the db
 * `entityKindValues` (`@rox/db/enums`). Kept inline so `@rox/shared` stays
 * db-free — the same inline-mirror pattern as `rox-ledger-kind.ts` and
 * `integrations/registry.ts`. Only used to type the label/deep-link lookups
 * below; the graph router is the runtime source of truth for the kind value.
 */
export type EntityKind =
	| "note"
	| "email"
	| "email_thread"
	| "message"
	| "channel"
	| "task"
	| "project"
	| "area"
	| "calendar_event"
	| "agent_session"
	| "activity_event"
	| "feed"
	| "feed_item"
	| "file"
	| "design_artifact"
	| "contact"
	| "osint_entity"
	| "tag"
	| "journal";

/** The slice of a `graph.listContacts` item this surface renders. */
export interface ContactListItemInput {
	entityId: string;
	slug: string | null;
	title: string;
	displayName: string | null;
	primaryEmail: string | null;
	avatarUrl: string | null;
	isSelf: boolean;
	fieldCount: number;
}

/** A render-ready contact card. */
export interface ContactCardViewModel {
	entityId: string;
	/** Best display name: detail `displayName`, else the node `title`. */
	name: string;
	/** Up-to-two-letter initials for the avatar fallback. */
	initials: string;
	/** Avatar image URL, or null to render the initials fallback. */
	avatarUrl: string | null;
	/** Secondary line (email when present, else a field-count hint, else null). */
	subtitle: string | null;
	/** Primary email, surfaced separately for the `mailto:` affordance. */
	email: string | null;
	/** `mailto:` href when an email exists, else null. */
	mailtoHref: string | null;
	/** True for the current user's own contact (badge). */
	isSelf: boolean;
}

/** Best display name for a contact: detail name first, then node title. */
export function contactDisplayName(input: ContactListItemInput): string {
	const name = input.displayName?.trim();
	if (name && name.length > 0) {
		return name;
	}
	const title = input.title?.trim();
	return title && title.length > 0 ? title : "Без имени";
}

/**
 * Up-to-two-letter initials from a display name. Takes the first letter of the
 * first two whitespace-separated words; falls back to the first two characters
 * of a single token, uppercased. Empty/whitespace name → "?".
 */
export function contactInitials(name: string): string {
	const words = name
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	if (words.length === 0) {
		return "?";
	}
	if (words.length === 1) {
		return (words[0] ?? "").slice(0, 2).toUpperCase();
	}
	const first = words[0]?.[0] ?? "";
	const second = words[1]?.[0] ?? "";
	return `${first}${second}`.toUpperCase();
}

/** Map a single contact item to its card view model. */
export function toContactCard(
	input: ContactListItemInput,
): ContactCardViewModel {
	const name = contactDisplayName(input);
	const email = input.primaryEmail?.trim() || null;
	const subtitle =
		email ??
		(input.fieldCount > 0
			? `${input.fieldCount} ${pluralizeFields(input.fieldCount)}`
			: null);
	return {
		entityId: input.entityId,
		name,
		initials: contactInitials(name),
		avatarUrl: input.avatarUrl?.trim() || null,
		subtitle,
		email,
		mailtoHref: email ? `mailto:${email}` : null,
		isSelf: input.isSelf,
	};
}

/** Map a list of contact items to card view models (order preserved). */
export function mapContactCards(
	items: readonly ContactListItemInput[],
): ContactCardViewModel[] {
	return items.map(toContactCard);
}

// --- linked objects (contact detail, via graph.neighbors) ------------------

/** A `graph.neighbors` node (the shape the neighbors query returns). */
export interface NeighborNode {
	entityId: string;
	kind: EntityKind;
	title: string;
	slug: string | null;
}

/** A `graph.neighbors` edge (depth-1/2 incident edge). */
export interface NeighborEdge {
	id: string;
	sourceEntityId: string;
	targetEntityId: string | null;
	relation: string;
	resolved: boolean;
}

/** A render-ready row for one object a contact is linked to. */
export interface ContactLinkViewModel {
	/** The linked object's entity id. */
	entityId: string;
	/** The linked object's title. */
	title: string;
	/** RU label for the object kind (badge). */
	kindLabel: string;
	/** RU label for the relation connecting the contact to the object. */
	relationLabel: string;
	/** `rox://…` deep link when the kind has an openable route + a slug, else null. */
	href: string | null;
}

const KIND_LABELS: Partial<Record<EntityKind, string>> = {
	note: "Заметка",
	task: "Задача",
	project: "Проект",
	contact: "Контакт",
	feed: "Лента",
	file: "Файл",
	email: "Письмо",
	message: "Сообщение",
	channel: "Канал",
	calendar_event: "Событие",
	agent_session: "Сессия агента",
	journal: "Журнал",
	area: "Область",
	design_artifact: "Дизайн",
};

const RELATION_LABELS: Record<string, string> = {
	authored_by: "Автор",
	mentions: "Упоминание",
	participant_of: "Участник",
	about: "О контакте",
	references: "Ссылка",
	links_to: "Связь",
	tagged_with: "Тег",
	derived_from: "Производное",
};

/** Kinds with a real desktop route → `rox://<segment>/<slug>` (honest: no fake routes). */
const KIND_DEEPLINK_SEGMENT: Partial<Record<EntityKind, string>> = {
	task: "tasks",
	note: "notes",
};

export function contactKindLabel(kind: EntityKind): string {
	return KIND_LABELS[kind] ?? kind;
}

export function contactRelationLabel(relation: string): string {
	return RELATION_LABELS[relation] ?? relation;
}

const PROD_SCHEME = "rox";

function neighborHref(node: NeighborNode): string | null {
	const segment = KIND_DEEPLINK_SEGMENT[node.kind];
	if (!segment || !node.slug) {
		return null;
	}
	return `${PROD_SCHEME}://${segment}/${encodeURIComponent(node.slug)}`;
}

/**
 * Map a focused contact's `graph.neighbors` result to its linked-object rows.
 *
 * For each RESOLVED edge incident to `contactEntityId`, the OTHER endpoint is the
 * linked object; it is hydrated from the `nodes` set (skipped when missing, e.g.
 * pruned by the node budget) and labelled by kind + relation. Self-referential
 * edges and the contact's own node are excluded. Order follows the edge order
 * the query returned; duplicate (object,relation) pairs are de-duplicated.
 */
export function mapContactLinks(params: {
	contactEntityId: string;
	nodes: readonly NeighborNode[];
	edges: readonly NeighborEdge[];
}): ContactLinkViewModel[] {
	const nodeById = new Map<string, NeighborNode>();
	for (const node of params.nodes) {
		nodeById.set(node.entityId, node);
	}

	const out: ContactLinkViewModel[] = [];
	const seen = new Set<string>();
	for (const edge of params.edges) {
		if (!edge.resolved) {
			continue;
		}
		const touchesContact =
			edge.sourceEntityId === params.contactEntityId ||
			edge.targetEntityId === params.contactEntityId;
		if (!touchesContact) {
			continue;
		}
		const otherId =
			edge.sourceEntityId === params.contactEntityId
				? edge.targetEntityId
				: edge.sourceEntityId;
		if (!otherId || otherId === params.contactEntityId) {
			continue;
		}
		const node = nodeById.get(otherId);
		if (!node) {
			continue;
		}
		const dedupeKey = `${otherId}:${edge.relation}`;
		if (seen.has(dedupeKey)) {
			continue;
		}
		seen.add(dedupeKey);
		out.push({
			entityId: node.entityId,
			title: node.title,
			kindLabel: contactKindLabel(node.kind),
			relationLabel: contactRelationLabel(edge.relation),
			href: neighborHref(node),
		});
	}
	return out;
}

function pluralizeFields(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) {
		return "поле";
	}
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
		return "поля";
	}
	return "полей";
}
