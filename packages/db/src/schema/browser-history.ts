/**
 * Rox server-side per-workspace browser history — D4 browser-data pipeline
 * (WS-O T9, tables proposed by WS-N §2D and handed off here).
 *
 * The in-app ("branch") browser imports a user's real browsing history, keeps it
 * locally for ~7 days, then uploads it to OUR server and purges the local copy.
 * Long-term we keep OUR OWN cleaned, PER-WORKSPACE history server-side. These
 * tables are that durable server store:
 *   workspace_browser_history → cleaned, deduped, per-(workspace,user,url) rows
 *   browser_data_consents     → the server record of the mandatory opt-in/consent
 *                               (revocable; revocation stops capture + purges)
 *
 * Per D4 the upload is consent-gated: no row lands here until the user has an
 * `accepted` consent record. The `browserHistory.upload` tRPC mutation that
 * WRITES these tables is owned by the trpc/api owner, NOT WS-O — WS-O ships only
 * the tables + types.
 *
 * `organization_id` is denormalized on both tables for ElectricSQL shape
 * filtering (the `team_members` pattern). This is the SERVER store; the local
 * 7-day SQLite store lives in `packages/local-db` (owned by WS-N) and is NOT
 * governed by this `packages/db` schema.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { v2Workspaces } from "./schema";

// ---------------------------------------------------------------------------
// workspace_browser_history — cleaned, long-term, per-workspace history
// ---------------------------------------------------------------------------

export const workspaceBrowserHistory = pgTable(
	"workspace_browser_history",
	{
		id: uuid().primaryKey().defaultRandom(),
		// Denormalized for Electric shape filtering (team_members pattern).
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2WorkspaceId: uuid("v2_workspace_id")
			.notNull()
			.references(() => v2Workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		url: text().notNull(),
		title: text(),
		faviconUrl: text("favicon_url"),

		visitedAt: timestamp("visited_at", { withTimezone: true }).notNull(),
		visitCount: integer("visit_count").notNull().default(1),

		firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("workspace_browser_history_org_idx").on(t.organizationId),
		index("workspace_browser_history_workspace_idx").on(t.v2WorkspaceId),
		index("workspace_browser_history_user_idx").on(t.userId),
		uniqueIndex("workspace_browser_history_workspace_user_url_unique").on(
			t.v2WorkspaceId,
			t.userId,
			t.url,
		),
	],
);

export type InsertWorkspaceBrowserHistory =
	typeof workspaceBrowserHistory.$inferInsert;
export type SelectWorkspaceBrowserHistory =
	typeof workspaceBrowserHistory.$inferSelect;

// ---------------------------------------------------------------------------
// browser_data_consents — server record of the mandatory opt-in (revocable)
// ---------------------------------------------------------------------------

export const browserDataConsents = pgTable(
	"browser_data_consents",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		accepted: boolean().notNull().default(false),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("browser_data_consents_org_idx").on(t.organizationId),
		index("browser_data_consents_user_idx").on(t.userId),
		uniqueIndex("browser_data_consents_org_user_unique").on(
			t.organizationId,
			t.userId,
		),
	],
);

export type InsertBrowserDataConsent = typeof browserDataConsents.$inferInsert;
export type SelectBrowserDataConsent = typeof browserDataConsents.$inferSelect;
