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

import {
	type AnyPgColumn,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
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
		index("chat_messages_org_idx").on(t.organizationId),
		// Primary feed read: all messages of a session in chronological order.
		index("chat_messages_session_created_idx").on(t.sessionId, t.createdAt),
		// Branch lookups for Map/Flow views (children of a given message).
		index("chat_messages_parent_idx").on(t.parentMessageId),
	],
);

export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type SelectChatMessage = typeof chatMessages.$inferSelect;
