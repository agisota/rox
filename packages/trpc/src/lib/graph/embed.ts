/**
 * Graph core (#01) — qdrant embedding contract + identity normalization.
 *
 * The core owns the *contract* of the single `rox_entities` collection; the
 * actual indexer/embedder runs in #02. These are pure functions:
 *   - `buildEmbedText(entity)` assembles the text to embed per kind (extensible
 *     by domains via the `embedTextByKind` registry);
 *   - `entityToQdrantPayload(entity)` is the required payload (filterable);
 *   - `normalizeIdentityValue(kind, value)` normalizes an identity value
 *     (email/domain lowercased) before identity resolution.
 */

import type { EntityKind, IdentityKind, SelectEntity } from "@rox/db/schema";

/** Minimal node shape the embed/payload helpers need. */
export type EmbeddableEntity = Pick<
	SelectEntity,
	| "id"
	| "kind"
	| "organizationId"
	| "title"
	| "markdown"
	| "body"
	| "status"
	| "v2ProjectId"
	| "createdByUserId"
	| "updatedAt"
>;

/**
 * Per-kind embed-text builders. Domains extend this registry (e.g. contact adds
 * emails, agent_session adds summary). The default uses `title + markdown`.
 */
export const embedTextByKind: Partial<
	Record<EntityKind, (e: EmbeddableEntity) => string>
> = {
	note: (e) => joinText(e.title, e.markdown),
	contact: (e) => joinText(e.title, stringField(e.body, "emails")),
	agent_session: (e) => joinText(e.title, stringField(e.body, "summary")),
};

/** Assemble the text embedded for a node (kind-aware, with a generic default). */
export function buildEmbedText(entity: EmbeddableEntity): string {
	const builder = embedTextByKind[entity.kind];
	if (builder) return builder(entity).trim();
	// Generic default: title + (markdown | summary).
	return joinText(
		entity.title,
		entity.markdown ?? stringField(entity.body, "summary"),
	).trim();
}

/** Qdrant payload (filterable). `orgId` is always required for search filters. */
export interface QdrantEntityPayload {
	entityId: string;
	kind: EntityKind;
	orgId: string;
	userId?: string;
	v2ProjectId?: string;
	status: string;
	/** ISO-8601 UTC timestamp for reindex-by-updatedAt. */
	updatedAt: string;
}

/** Build the qdrant payload for an entity (point id = `entity.id`). */
export function entityToQdrantPayload(
	entity: EmbeddableEntity,
): QdrantEntityPayload {
	return {
		entityId: entity.id,
		kind: entity.kind,
		orgId: entity.organizationId,
		userId: entity.createdByUserId ?? undefined,
		v2ProjectId: entity.v2ProjectId ?? undefined,
		status: entity.status,
		updatedAt: entity.updatedAt.toISOString(),
	};
}

/**
 * Normalize an identity value before resolution: email/domain → lowercased +
 * trimmed; other kinds → trimmed. Keeps `identity_links_org_kind_value_uniq`
 * stable regardless of input casing.
 */
export function normalizeIdentityValue(
	kind: IdentityKind,
	value: string,
): string {
	const trimmed = value.trim();
	if (kind === "email" || kind === "domain") return trimmed.toLowerCase();
	return trimmed;
}

// --- helpers ---------------------------------------------------------------

function joinText(...parts: Array<string | null | undefined>): string {
	return parts.filter((p): p is string => Boolean(p?.length)).join("\n\n");
}

function stringField(
	body: Record<string, unknown> | null | undefined,
	field: string,
): string | undefined {
	const value = body?.[field];
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === "string").join(", ");
	}
	return undefined;
}
