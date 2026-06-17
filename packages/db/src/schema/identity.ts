/**
 * Graph core (#01) — `identity_links`, contact resolution (D6).
 *
 * Maps an external identity `(kind, value)` — email address, chat handle,
 * calendar attendee, git author, capture selector, phone, domain — to exactly
 * one `contact` node (`contactEntityId` targets an `entities` row of
 * kind=`contact`). Mail/chat/calendar/capture call `resolveIdentity` to
 * find-or-create the contact + this link when attaching participants.
 *
 * `(org, kind, value)` is unique: one external identity resolves to one contact
 * per org. Mirrors `knowledge.ts` conventions. NEVER hand-edit migrations —
 * change this file then run `bunx drizzle-kit generate --name="..."`.
 */

import {
	boolean,
	foreignKey,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { contacts } from "./contact";
import { identityKindValues } from "./enums";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const identityKind = pgEnum("identity_kind", identityKindValues);

// ---------------------------------------------------------------------------
// identity_links — external identity → contact node resolution
// ---------------------------------------------------------------------------

export const identityLinks = pgTable(
	"identity_links",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Targets a contact detail row, not any arbitrary entity.
		contactEntityId: uuid("contact_entity_id").notNull(),
		kind: identityKind().notNull(),
		// Address / handle / selector (normalized, e.g. email lowercased).
		value: text().notNull(),
		verified: boolean().notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("identity_links_contact_idx").on(t.contactEntityId),
		foreignKey({
			columns: [t.contactEntityId, t.organizationId],
			foreignColumns: [contacts.entityId, contacts.organizationId],
			name: "identity_links_contact_org_fk",
		}).onDelete("cascade"),
		// One (kind, value) per org resolves to exactly one contact.
		uniqueIndex("identity_links_org_kind_value_uniq").on(
			t.organizationId,
			t.kind,
			t.value,
		),
	],
);

export type InsertIdentityLink = typeof identityLinks.$inferInsert;
export type SelectIdentityLink = typeof identityLinks.$inferSelect;
