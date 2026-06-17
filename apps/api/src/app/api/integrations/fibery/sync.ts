/**
 * Pure mapping layer: Fibery entity -> normalized task-input object.
 *
 * This module performs NO I/O. It mirrors the shape produced by the Linear
 * vertical's `mapIssueToTask`, but stops at a provider-normalized task input so
 * it can be unit-tested in isolation and reused by the QStash job route, which
 * owns persistence (status resolution, upsert).
 */

/**
 * A Fibery entity as returned by `fibery.entity/query`. Field names in Fibery
 * are namespaced (e.g. `fibery/id`). The title/state fields are configurable
 * per workspace, so the mapper accepts a few common aliases and falls back
 * gracefully when none are present.
 */
export interface FiberyEntity {
	/** Stable Fibery entity id; the external identity used for upserts. */
	"fibery/id"?: string;
	/** Common title aliases across Fibery databases. */
	name?: string | null;
	title?: string | null;
	"fibery/name"?: string | null;
	/** Optional workflow state name (raw, provider-specific). */
	state?: string | null;
	/** Allow unknown extra fields without widening to `any`. */
	[key: string]: unknown;
}

/** Context threaded into every mapped task (ownership + provenance). */
export interface FiberyMapContext {
	organizationId: string;
}

/**
 * Normalized task input produced from a Fibery entity. Intentionally a plain
 * object (not the full DB insert) so this layer stays I/O-free; the route
 * augments it with a resolved `statusId`, `creatorId`, and timestamps before
 * upserting.
 */
export interface FiberyTaskInput {
	organizationId: string;
	externalProvider: "fibery";
	externalId: string;
	title: string;
	/** Raw Fibery state name, if any, for downstream status mapping. */
	externalState: string | null;
}

/** Title used when a Fibery entity has no recognizable title field. */
export const FIBERY_FALLBACK_TITLE = "Untitled";

function resolveTitle(entity: FiberyEntity): string {
	const candidate = entity.name ?? entity.title ?? entity["fibery/name"];
	const trimmed = typeof candidate === "string" ? candidate.trim() : "";
	return trimmed.length > 0 ? trimmed : FIBERY_FALLBACK_TITLE;
}

/**
 * Maps a single Fibery entity to a normalized task input. Returns `null` when
 * the entity has no `fibery/id` (it cannot participate in an external-id-keyed
 * upsert), so callers can filter those out.
 */
export function mapFiberyEntityToTask(
	entity: FiberyEntity,
	ctx: FiberyMapContext,
): FiberyTaskInput | null {
	const externalId = entity["fibery/id"];
	if (typeof externalId !== "string" || externalId.length === 0) {
		return null;
	}

	const state = typeof entity.state === "string" ? entity.state : null;

	return {
		organizationId: ctx.organizationId,
		externalProvider: "fibery",
		externalId,
		title: resolveTitle(entity),
		externalState: state,
	};
}

/**
 * Maps a list of Fibery entities, dropping any that lack a `fibery/id`.
 */
export function mapFiberyEntities(
	entities: FiberyEntity[],
	ctx: FiberyMapContext,
): FiberyTaskInput[] {
	const mapped: FiberyTaskInput[] = [];
	for (const entity of entities) {
		const task = mapFiberyEntityToTask(entity, ctx);
		if (task) mapped.push(task);
	}
	return mapped;
}
