/**
 * Project OS (#01, Phase-1) — native object-graph read for CRM contacts.
 *
 * Lists `kind=contact` nodes for the org joined to their 1:1 `contacts` detail
 * row (display name / primary email / avatar / `is_self` / free-form `fields`),
 * keyset-paginated newest-first. This is the dedicated read for the CRM contacts
 * surface: `graph.listByKind` returns only base entity columns (no email/avatar),
 * which is too thin for a contacts list, so this read LEFT JOINs the shipped
 * `contacts` detail table.
 *
 * READ-ONLY and reuses the core schema directly (mirrors `loadProjectGraph` /
 * the inline read in `graphRouter.neighbors`); the graph-service stays the only
 * WRITER. The pure `assembleContactList` step is split out so the mapping is
 * unit-testable without a live database. No migration — the `contact`
 * entity_kind and the `contacts` table already ship.
 */

import { contacts, entities } from "@rox/db/schema";
import { and, desc, eq, gt, lt, or } from "drizzle-orm";
import type { GraphDb } from "./types";

/** A contact row the CRM list renders (entity node + its detail). */
export interface ContactListItem {
	/** Graph node id (`entities.id`, == `contacts.entity_id`). */
	entityId: string;
	/** Node slug, when the contact has one (addressable), else null. */
	slug: string | null;
	/** The node title (always present). */
	title: string;
	/** Detail display name; null when no `contacts` detail row exists yet. */
	displayName: string | null;
	/** Primary email from the detail row, when known. */
	primaryEmail: string | null;
	/** Avatar URL from the detail row, when known. */
	avatarUrl: string | null;
	/** True when this is the current user's own contact. */
	isSelf: boolean;
	/** Count of extra structured fields (org/title/phone/social, …) on the detail. */
	fieldCount: number;
	/** Last update of the node (drives the keyset order). */
	updatedAt: Date;
}

export interface ContactListResult {
	items: ContactListItem[];
	/** Opaque keyset cursor (last item's entityId) when more rows exist. */
	nextCursor?: string;
}

/** Minimal joined row the assembly consumes (DB-shape-independent). */
export interface ContactJoinRow {
	entityId: string;
	slug: string | null;
	title: string;
	updatedAt: Date;
	displayName: string | null;
	primaryEmail: string | null;
	avatarUrl: string | null;
	isSelf: boolean | null;
	fields: Record<string, unknown> | null;
}

/**
 * Pure assembly of the contact list from already-fetched joined rows.
 *
 * Applies the `limit + 1` overflow probe (the caller fetches one extra row): if
 * `rows` is longer than `limit`, the surplus is trimmed and the last kept row's
 * `entityId` becomes the `nextCursor`. Each row is normalized to a
 * presentation-ready {@link ContactListItem} (null-coalescing the detail columns
 * a node may not have a `contacts` row for yet, and counting `fields`).
 */
export function assembleContactList(
	rows: readonly ContactJoinRow[],
	limit: number,
): ContactListResult {
	const hasMore = rows.length > limit;
	const kept = hasMore ? rows.slice(0, limit) : rows;
	const items = kept.map(toContactListItem);
	const nextCursor = hasMore ? items[items.length - 1]?.entityId : undefined;
	return { items, nextCursor };
}

/** Normalize one joined row to a presentation-ready contact item. */
export function toContactListItem(row: ContactJoinRow): ContactListItem {
	const fields = row.fields ?? {};
	return {
		entityId: row.entityId,
		slug: row.slug,
		title: row.title,
		displayName: row.displayName,
		primaryEmail: row.primaryEmail,
		avatarUrl: row.avatarUrl,
		isSelf: row.isSelf ?? false,
		fieldCount: countFields(fields),
		updatedAt: row.updatedAt,
	};
}

/** Count own enumerable keys of the free-form `fields` jsonb (0 when absent). */
function countFields(fields: Record<string, unknown>): number {
	return Object.keys(fields).length;
}

export interface LoadContactsParams {
	orgId: string;
	/** Lifecycle filter for the contact nodes (default: active). */
	status?: "active" | "archived" | "trashed";
	/** Keyset cursor: the last `entityId` from the previous page. */
	cursor?: string;
	/** Max contacts per page (bounds the read). */
	limit: number;
}

/**
 * Load the org's contacts (newest-first, keyset-paginated). Reads only.
 *
 * 1. `entities` `WHERE org=$ AND kind='contact' AND status=$`, LEFT JOINed to
 *    `contacts` on `entity_id` (a node missing its detail row still lists).
 * 2. Keyset on `(updated_at desc, id asc)`: rows strictly "after" the cursor row
 *    — same keyset shape as `graphService.listByKind`, so paging is stable.
 * 3. `limit + 1` probe trimmed by {@link assembleContactList} to derive the cursor.
 */
export async function loadContacts(
	db: GraphDb,
	params: LoadContactsParams,
): Promise<ContactListResult> {
	const status = params.status ?? "active";
	const conditions = [
		eq(entities.organizationId, params.orgId),
		eq(entities.kind, "contact"),
		eq(entities.status, status),
	];

	if (params.cursor) {
		const [cursorRow] = await db
			.select({ updatedAt: entities.updatedAt, id: entities.id })
			.from(entities)
			.where(
				and(
					eq(entities.organizationId, params.orgId),
					eq(entities.id, params.cursor),
				),
			)
			.limit(1);
		if (cursorRow) {
			const keyset = or(
				lt(entities.updatedAt, cursorRow.updatedAt),
				and(
					eq(entities.updatedAt, cursorRow.updatedAt),
					gt(entities.id, cursorRow.id),
				),
			);
			if (keyset) conditions.push(keyset);
		}
	}

	const rows = await db
		.select({
			entityId: entities.id,
			slug: entities.slug,
			title: entities.title,
			updatedAt: entities.updatedAt,
			displayName: contacts.displayName,
			primaryEmail: contacts.primaryEmail,
			avatarUrl: contacts.avatarUrl,
			isSelf: contacts.isSelf,
			fields: contacts.fields,
		})
		.from(entities)
		.leftJoin(contacts, eq(contacts.entityId, entities.id))
		.where(and(...conditions))
		.orderBy(desc(entities.updatedAt), entities.id)
		.limit(params.limit + 1);

	return assembleContactList(rows, params.limit);
}
