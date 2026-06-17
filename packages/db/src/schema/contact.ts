/**
 * Graph core (#01) — `contacts`, the one detail table the core ships (1:1).
 *
 * A contact is the target of `identity_links` and of `authored_by` / `mentions`
 * / `participant_of` edges, so identity resolution is non-functional without it.
 * The node (kind=`contact`) is written by the graph-service (`resolveIdentity`);
 * this table is the 1:1 detail keyed on `entities.id`. Other detail tables
 * (notes/tasks/agent_sessions/…) belong to their own subsystems.
 *
 * PK == FK to the graph node (1:1). Mirrors the core conventions: org cascade FK
 * + org index, jsonb fields, timestamptz `created_at`/`updated_at` with
 * `$onUpdate`. NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."`.
 */

import {
	boolean,
	foreignKey,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity";

// ---------------------------------------------------------------------------
// contacts — 1:1 detail for kind=contact nodes
// ---------------------------------------------------------------------------

export const contacts = pgTable(
	"contacts",
	{
		// PK == FK on the graph node (1:1). The node is written by the
		// graph-service; this row is detail only.
		entityId: uuid("entity_id").primaryKey(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		primaryEmail: text("primary_email"),
		avatarUrl: text("avatar_url"),
		// Link to the platform user if this contact is an org member.
		linkedUserId: uuid("linked_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// The current user's own contact (for `authored_by`).
		isSelf: boolean("is_self").notNull().default(false),
		// org / title / phone / social, etc.
		fields: jsonb().$type<Record<string, unknown>>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("contacts_org_idx").on(t.organizationId),
		index("contacts_linked_user_idx").on(t.linkedUserId),
		index("contacts_primary_email_idx").on(t.primaryEmail),
		unique("contacts_entity_org_uniq").on(t.entityId, t.organizationId),
		foreignKey({
			columns: [t.entityId, t.organizationId],
			foreignColumns: [entities.id, entities.organizationId],
			name: "contacts_entity_org_fk",
		}).onDelete("cascade"),
	],
);

export type InsertContact = typeof contacts.$inferInsert;
export type SelectContact = typeof contacts.$inferSelect;
