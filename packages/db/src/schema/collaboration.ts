/**
 * Collaboration (#11) — durable comment threads on Project-OS objects
 * (`collaboration.threadsAsObjects`).
 *
 * A comment thread is anchored to ONE universal graph node (`entities.id`): the
 * object the discussion is "about". Each object has at most one thread per org
 * (`(organization_id, entity_id)` unique), and a thread owns an append-only list
 * of `comments` authored by users. Threads carry the `v2_project_id` of the
 * object so the Project-OS surface can scope/filter discussion per project.
 *
 * Tenancy mirrors `entity.ts`/`edges.ts`: org cascade FK + org index, a COMPOSITE
 * FK to `entities(id, organization_id)` so a thread can NEVER anchor to an object
 * in another org (the same guard `edges_source_entity_org_fk` uses), and
 * `v2_project_id` set-null. Both tables sync to clients durably through
 * electric-proxy (`TABLE_SCOPES`, org-scoped).
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity";
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// comment_threads — one discussion anchored to a graph object
// ---------------------------------------------------------------------------

export const commentThreads = pgTable(
	"comment_threads",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// The object this thread is about. The COMPOSITE FK below pins it to the
		// same org, so a thread can never reference a cross-org entity.
		entityId: uuid("entity_id").notNull(),
		// Denormalized project scope of the anchored object (set-null if the project
		// is removed) so Project-OS can filter discussion per project.
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("comment_threads_org_idx").on(t.organizationId),
		index("comment_threads_project_idx").on(t.v2ProjectId),
		// One thread per object per org (the get-or-create natural key).
		uniqueIndex("comment_threads_org_entity_uniq").on(
			t.organizationId,
			t.entityId,
		),
		// Anchor the thread to an entity IN THE SAME ORG (no cross-org anchoring).
		foreignKey({
			columns: [t.entityId, t.organizationId],
			foreignColumns: [entities.id, entities.organizationId],
			name: "comment_threads_entity_org_fk",
		}).onDelete("cascade"),
	],
);

export type InsertCommentThread = typeof commentThreads.$inferInsert;
export type SelectCommentThread = typeof commentThreads.$inferSelect;

// ---------------------------------------------------------------------------
// comments — append-only authored messages in a thread
// ---------------------------------------------------------------------------

export const comments = pgTable(
	"comments",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		threadId: uuid("thread_id")
			.notNull()
			.references(() => commentThreads.id, { onDelete: "cascade" }),
		// Author = the user who created the comment (the caller). Set-null on user
		// deletion keeps the message but drops the back-reference.
		authorUserId: uuid("author_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// Plain-text/markdown comment body.
		body: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("comments_org_idx").on(t.organizationId),
		// Primary read path: "all comments in this thread, oldest first".
		index("comments_thread_created_idx").on(t.threadId, t.createdAt),
	],
);

export type InsertComment = typeof comments.$inferInsert;
export type SelectComment = typeof comments.$inferSelect;
