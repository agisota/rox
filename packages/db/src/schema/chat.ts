/**
 * Rox Chat — multi-view chat epic (Dialogue · Map · Flow · Atlas).
 *
 * `chat_messages` is the persisted dialogue feed for an agent chat session. It is
 * the single source of truth that every view renders from: the Dialogue/Lens feed
 * reads it linearly, while the Map (mindmap) and Flow (DAG) views read the
 * `parent_message_id` self-reference to reconstruct the branching/threading
 * structure of a conversation. One row per message; a message with a non-null
 * `parent_message_id` is a reply/branch off its parent.
 *
 * Sessions themselves live outside Postgres (durable-session / host service), so
 * `session_id` is stored as an opaque uuid WITHOUT a foreign key. Org + author
 * FKs cascade-delete with their owners, matching `journal_entries`.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import type { SavedViewRule } from "@rox/shared/chat-saved-view";
import {
	type AnyPgColumn,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { entitySearchVectorSql } from "./_shared";
import { organizations, users } from "./auth";

/** Author role of a chat message. */
export const chatMessageRoleValues = [
	"user",
	"assistant",
	"system",
	"tool",
] as const;
export type ChatMessageRole = (typeof chatMessageRoleValues)[number];
export const chatMessageRole = pgEnum(
	"chat_message_role",
	chatMessageRoleValues,
);

/**
 * Free-form per-message metadata (model id, token usage, tool call payloads,
 * view-specific annotations). Kept as jsonb so views can attach data without a
 * migration; promote hot fields to columns once they stabilize.
 */
export type ChatMessageMetadata = Record<string, unknown>;

export const chatMessages = pgTable(
	"chat_messages",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Author of the message. Sessions are single-user (one agent session per
		// user — Rox has no session participants/shared-session model), so cascade
		// is intentional: deleting a user removes their own session history. If a
		// multi-participant session model is ever introduced, revisit this to
		// `set null` so a leaver's messages don't vanish from shared history.
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// The agent chat session this message belongs to. Sessions are not stored in
		// Postgres, so this is an opaque uuid with no FK (indexed for feed reads).
		sessionId: uuid("session_id").notNull(),

		// Parent message for branching/threading. Null = root of the conversation.
		// Self-referential FK; deleting a parent detaches children rather than
		// cascading, so a branch is never silently dropped.
		parentMessageId: uuid("parent_message_id").references(
			(): AnyPgColumn => chatMessages.id,
			{ onDelete: "set null" },
		),

		role: chatMessageRole().notNull(),
		content: text().notNull().default(""),
		metadata: jsonb().$type<ChatMessageMetadata>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Primary feed read: a session's messages in chronological order, scoped by
		// org. Org-leading so a query that forgets the org filter can't use the
		// index (seq scan surfaces the mistake), and so it also covers org-only
		// lookups via its leftmost prefix — no separate org index needed.
		index("chat_messages_org_session_created_idx").on(
			t.organizationId,
			t.sessionId,
			t.createdAt,
		),
		// Branch lookups for Map/Flow views (children of a given message).
		index("chat_messages_parent_idx").on(t.parentMessageId),
		// Expression GIN index backing the F16 cross-entity search (Messages facet).
		// Built from the SAME `entitySearchVectorSql` the search router uses, so the
		// indexed expression and the query expression cannot drift (a drift would
		// force a seq scan). Mirrors `knowledge_documents_fts_idx`.
		index("chat_messages_fts_idx").using(
			"gin",
			entitySearchVectorSql([t.content]),
		),
	],
);

export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type SelectChatMessage = typeof chatMessages.$inferSelect;

// ---------------------------------------------------------------------------
// chat_labels — org-scoped colour/icon registry for chat-session labels (F11)
// ---------------------------------------------------------------------------

/**
 * Org-scoped registry of label *presentation* (colour + optional icon), keyed by
 * label name. The label-to-session *membership* lives in `chat_sessions.labels`
 * (a `jsonb<string[]>` of label names) and is intentionally NOT changed here:
 * this table only enriches the names that array references with a stable colour
 * and an optional icon, so the same label renders the same everywhere (F10/F11).
 *
 * Tags ⟂ identity: this is the organization axis only — never the who/where
 * (persona/org) axis. `(organization_id, name)` is unique so a name maps to one
 * presentation per org; the `color` default is the deterministic auto-colour
 * (`identityGlyph(name).background`, an `hsl(...)` string) computed server-side
 * on create (`@rox/shared/identity-glyph`, shared with F24 avatars). Mirrors the
 * `skill_libraries` org-scoped convention: org cascade FK, `created_by` set-null
 * FK, org-leading index for Electric shape filtering.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */
export const chatLabels = pgTable(
	"chat_labels",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		name: text().notNull(),
		// Ready-to-use CSS colour string (e.g. `hsl(214, 58%, 46%)`). Defaulted on
		// create from `identityGlyph(name).background` for a stable auto-colour.
		color: text().notNull(),
		// Optional icon token (icon name / emoji); null until the user picks one.
		icon: text(),

		createdBy: uuid("created_by").references(() => users.id, {
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
		index("chat_labels_org_idx").on(t.organizationId),
		uniqueIndex("chat_labels_org_name_unique").on(t.organizationId, t.name),
	],
);

export type InsertChatLabel = typeof chatLabels.$inferInsert;
export type SelectChatLabel = typeof chatLabels.$inferSelect;

// ---------------------------------------------------------------------------
// chat_saved_views — org-scoped named boolean tag filters / Smart Folders (F17)
// ---------------------------------------------------------------------------

/**
 * Org-scoped registry of *Saved Views*: a named, reusable boolean tag filter
 * over the chat list (Hermes-borrow F17). The filter expression lives in `rule`
 * as a serialisable `SavedViewRule` jsonb (AND/OR/NOT label axes + status +
 * untagged), authored once in the shared core (`@rox/shared/chat-saved-view`) so
 * web, desktop, and mobile evaluate one definition. Built-in Smart Folders
 * (Untagged / Has errors / CLI / …) are NOT stored here — they are fixed presets
 * in the shared core; this table holds only user-created views.
 *
 * Mirrors the `chat_labels` org-scoped convention: org cascade FK, `created_by`
 * set-null FK, org-leading index for Electric shape filtering, and a
 * `(organization_id, name)` unique so a view name maps to one rule per org.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */
export const chatSavedViews = pgTable(
	"chat_saved_views",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		name: text().notNull(),
		// Serialisable boolean tag-filter expression (the shared `SavedViewRule`).
		// jsonb so the rule can evolve (new axes) without a migration; the shared
		// zod schema validates shape on the tRPC edge before write.
		rule: jsonb().$type<SavedViewRule>().notNull().default({}),
		// Optional CSS colour for the view's rail chip (auto-coloured on create
		// from `identityGlyph(name).background`, like `chat_labels.color`).
		color: text(),

		createdBy: uuid("created_by").references(() => users.id, {
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
		index("chat_saved_views_org_idx").on(t.organizationId),
		uniqueIndex("chat_saved_views_org_name_unique").on(
			t.organizationId,
			t.name,
		),
	],
);

export type InsertChatSavedView = typeof chatSavedViews.$inferInsert;
export type SelectChatSavedView = typeof chatSavedViews.$inferSelect;
