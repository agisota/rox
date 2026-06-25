/**
 * Agent personas (Hermes-borrow F21) — the *agent-persona* half of the
 * dual-identity card.
 *
 * A persona is an org-scoped, user-owned agent identity (display name, avatar,
 * `@handle`, accent colour, free-form theme JSON) that the human operates
 * "as". The human half already lives in `user_profiles`/`userProfiles`; this is
 * the net-new persona half that F22/F23/F29 build on. Personas are NOT
 * `agent_sources` (a source is a connected backend; a persona is a presented
 * identity) — keep them distinct (review-gate).
 *
 * `active_personas` is the cross-device active-persona pointer (micro-decision
 * #2): one active persona per `(user, organization)`, mirrored server-side so
 * switching device keeps the same active persona. Tags ⟂ identity — personas
 * are the who/where axis, never the `chat_labels` (organization) axis.
 *
 * Every row is stamped with `organizationId` (DQ3, Electric shapes). NEVER
 * hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { relations } from "drizzle-orm";
import {
	foreignKey,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

// ---------------------------------------------------------------------------
// agent_personas — org-scoped, user-owned agent identities
// ---------------------------------------------------------------------------

export const agentPersonas = pgTable(
	"agent_personas",
	{
		id: uuid().primaryKey().defaultRandom(),
		// Owner of the persona (the human behind it). Cascade with the user.
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Org stamp (DQ3). A persona lives in exactly one org.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		displayName: text("display_name").notNull(),
		avatarUrl: text("avatar_url"),
		// Public `@handle` for the persona (slug-safe). Unique per org; null until
		// claimed.
		handle: text("handle"),
		// Ready-to-use CSS colour string (e.g. `hsl(214, 58%, 46%)`). Defaulted on
		// create from `identityGlyph(displayName).background`.
		accentColor: text("accent_color").notNull(),
		// Free-form presentation theme (model, gateway, skills, etc.). Opaque to
		// the DB; validated by the tRPC layer.
		themeJson: jsonb("theme_json"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("agent_personas_org_idx").on(t.organizationId),
		index("agent_personas_owner_idx").on(t.ownerUserId),
		// One persona handle per org (when claimed).
		uniqueIndex("agent_personas_org_handle_unique").on(
			t.organizationId,
			t.handle,
		),
		// Composite target for `active_personas`' same-org FK (so a pointer can
		// only reference a persona in the same org).
		uniqueIndex("agent_personas_id_org_unique").on(t.id, t.organizationId),
	],
);

export type InsertAgentPersona = typeof agentPersonas.$inferInsert;
export type SelectAgentPersona = typeof agentPersonas.$inferSelect;

// ---------------------------------------------------------------------------
// active_personas — cross-device active-persona pointer (micro-decision #2)
// ---------------------------------------------------------------------------

export const activePersonas = pgTable(
	"active_personas",
	{
		// One active persona per (user, organization). `userId` + `organizationId`
		// is the composite PK so the pointer is naturally cross-device.
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		personaId: uuid("persona_id").notNull(),

		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("active_personas_user_org_pk").on(t.userId, t.organizationId),
		index("active_personas_persona_idx").on(t.personaId),
		// The pointer can only target a persona in the SAME org (composite FK), so
		// a user can never point at a persona from another org.
		foreignKey({
			columns: [t.personaId, t.organizationId],
			foreignColumns: [agentPersonas.id, agentPersonas.organizationId],
			name: "active_personas_persona_org_fk",
		}).onDelete("cascade"),
	],
);

export type InsertActivePersona = typeof activePersonas.$inferInsert;
export type SelectActivePersona = typeof activePersonas.$inferSelect;

// ---------------------------------------------------------------------------
// relations
// ---------------------------------------------------------------------------

export const agentPersonasRelations = relations(
	agentPersonas,
	({ one, many }) => ({
		owner: one(users, {
			fields: [agentPersonas.ownerUserId],
			references: [users.id],
		}),
		organization: one(organizations, {
			fields: [agentPersonas.organizationId],
			references: [organizations.id],
		}),
		activePointers: many(activePersonas),
	}),
);

export const activePersonasRelations = relations(activePersonas, ({ one }) => ({
	persona: one(agentPersonas, {
		fields: [activePersonas.personaId],
		references: [agentPersonas.id],
	}),
	user: one(users, {
		fields: [activePersonas.userId],
		references: [users.id],
	}),
}));
