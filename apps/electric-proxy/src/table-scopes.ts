import {
	accessGrants,
	agentCommands,
	automationRuns,
	automations,
	calCalendars,
	chatSessions,
	commsParticipants,
	devicePresence,
	githubPullRequests,
	githubRepositories,
	integrationConnections,
	invitations,
	journalEntries,
	journalEvents,
	knowledgeDocuments,
	mailMessages,
	mailThreads,
	members,
	memoryImportJobs,
	memoryItems,
	projects,
	sandboxImages,
	subscriptions,
	taskStatuses,
	tasks,
	teamMembers,
	teams,
	userAmbientSettings,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
	workspaces,
} from "@rox/db/schema";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { WhereClause } from "./auth";

/**
 * Single source of truth for electric-proxy per-table tenancy.
 *
 * Every synced table appears here exactly once. The org-membership guard
 * (`index.ts`), the user-scoping guard (`index.ts`), the row-level `where`
 * rewrite (`where.ts`), and the column restrictions (`electric.ts`) are ALL
 * derived from this registry, so there is no `index.ts`/`where.ts`/`electric.ts`
 * split that can silently drift (e.g. add a per-user table but forget to add it
 * to `USER_SCOPED_TABLES`).
 *
 * Three shapes:
 *  - org-scoped:        `{ orgColumn }`            — row.org === requested org
 *  - user+org-scoped:   `{ orgColumn, userColumn }`— AND row.user === requesting user
 *  - irregular:         `{ custom: (ctx) => ... }` — for tables whose scoping
 *                       isn't a plain column equality (org-id-array membership,
 *                       jsonb/array containment, raw fragments).
 *
 * `columns` (optional) restricts the synced column set for sensitive tables.
 * `requiresOrgMembership` defaults to true; the only exception is
 * `auth.organizations`, which is scoped by the full org-id set, not one org.
 */
export interface ScopeContext {
	organizationId: string;
	organizationIds: string[];
	userId: string;
}

export interface TableScope {
	/** Column whose value must equal the requested organizationId. */
	orgColumn?: PgColumn;
	/** Column whose value must equal the requesting user (sub). Presence here
	 *  marks the table user-scoped: index.ts enforces userId === auth.sub. */
	userColumn?: PgColumn;
	/** Restrict the synced columns (comma-separated) for sensitive tables. */
	columns?: string;
	/** Whether to enforce org membership in index.ts (default true). */
	requiresOrgMembership?: boolean;
	/** Escape hatch for non-column-equality scoping. When set, it fully owns
	 *  the where-clause and `orgColumn`/`userColumn` are ignored for building. */
	custom?: (ctx: ScopeContext) => WhereClause;
}

export const TABLE_SCOPES: Record<string, TableScope> = {
	tasks: { orgColumn: tasks.organizationId },
	task_statuses: { orgColumn: taskStatuses.organizationId },
	projects: { orgColumn: projects.organizationId },
	v2_projects: { orgColumn: v2Projects.organizationId },
	v2_hosts: { orgColumn: v2Hosts.organizationId },
	v2_clients: { orgColumn: v2Clients.organizationId },
	v2_users_hosts: { orgColumn: v2UsersHosts.organizationId },
	v2_workspaces: { orgColumn: v2Workspaces.organizationId },
	"auth.members": { orgColumn: members.organizationId },
	"auth.invitations": { orgColumn: invitations.organizationId },
	"auth.teams": { orgColumn: teams.organizationId },
	"auth.team_members": { orgColumn: teamMembers.organizationId },

	"auth.organizations": {
		requiresOrgMembership: false,
		custom: ({ organizationIds }) => {
			if (organizationIds.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}
			const placeholders = organizationIds
				.map((_, i) => `$${i + 1}`)
				.join(", ");
			return {
				fragment: `"id" IN (${placeholders})`,
				params: [...organizationIds],
			};
		},
	},

	"auth.users": {
		custom: ({ organizationId }) => ({
			fragment: `"organization_ids" @> ARRAY[$1::uuid]`,
			params: [organizationId],
		}),
	},

	device_presence: { orgColumn: devicePresence.organizationId },
	agent_commands: { orgColumn: agentCommands.organizationId },
	access_grants: { orgColumn: accessGrants.organizationId },

	"auth.apikeys": {
		columns: "id,name,start,created_at,last_request",
		custom: ({ organizationId }) => ({
			fragment: `"organization_id" = $1`,
			params: [organizationId],
		}),
	},

	integration_connections: {
		orgColumn: integrationConnections.organizationId,
		columns:
			"id,organization_id,connected_by_user_id,provider,token_expires_at,external_org_id,external_org_name,config,created_at,updated_at",
	},

	// subscriptions is scoped by `reference_id` (= organization id), not a
	// column literally named organization_id.
	subscriptions: { orgColumn: subscriptions.referenceId },

	workspaces: { orgColumn: workspaces.organizationId },
	chat_sessions: { orgColumn: chatSessions.organizationId },

	journal_entries: {
		orgColumn: journalEntries.organizationId,
		userColumn: journalEntries.createdBy,
	},
	journal_events: {
		orgColumn: journalEvents.organizationId,
		userColumn: journalEvents.createdBy,
	},
	memory_import_jobs: {
		orgColumn: memoryImportJobs.organizationId,
		userColumn: memoryImportJobs.createdBy,
	},
	memory_items: {
		orgColumn: memoryItems.organizationId,
		userColumn: memoryItems.createdBy,
	},
	user_ambient_settings: {
		orgColumn: userAmbientSettings.organizationId,
		userColumn: userAmbientSettings.createdBy,
	},

	github_repositories: { orgColumn: githubRepositories.organizationId },
	github_pull_requests: { orgColumn: githubPullRequests.organizationId },
	automations: { orgColumn: automations.organizationId },
	automation_runs: { orgColumn: automationRuns.organizationId },

	// C2: sandbox_images is per-project sandbox build config, org-scoped so the
	// client can read its org's recipes; now syncable through electric-proxy.
	sandbox_images: { orgColumn: sandboxImages.organizationId },

	// -------------------------------------------------------------------------
	// Comms suite live shapes (AD-2 migration; HARDENING-AUDIT I7/T5/N7).
	//
	// SECURITY GATE — Electric `where` is evaluated against a SINGLE row of the
	// shape's own table; it supports NO subqueries / joins / EXISTS. Therefore a
	// table can only be safely registered here when its row carries a column that
	// directly identifies the authorized user (owner_user_id / created_by_user_id
	// / user_id) AND organization_id. Any table whose authorization is a
	// cross-table membership (participant join, calendar share, owner-via-parent)
	// CANNOT be expressed by this predicate model and is intentionally NOT
	// registered — a bare org filter on those tables would leak every org
	// member's DMs / mail / events (the MASTER-PLAN #1 risk). Deferred tables and
	// the reason are recorded in plans/rox-comms-suite/HARDENING-AUDIT.md (AD-2).
	// -------------------------------------------------------------------------

	// comms_participants: a user receives ONLY their own participant rows
	// (user_id = caller) within the org. This is leak-free: it never exposes
	// another participant's membership. (Co-participant rows for a thread are a
	// cross-table concern resolved via tRPC, not this shape.)
	comms_participants: {
		orgColumn: commsParticipants.organizationId,
		userColumn: commsParticipants.userId,
	},

	// mail_threads / mail_messages: the mailbox is strictly per-user, keyed by
	// owner_user_id (+ organization_id). Direct column ⇒ safe.
	mail_threads: {
		orgColumn: mailThreads.organizationId,
		userColumn: mailThreads.ownerUserId,
	},
	mail_messages: {
		orgColumn: mailMessages.organizationId,
		userColumn: mailMessages.ownerUserId,
	},

	// cal_calendars: OWNED calendars only (owner_user_id + organization_id).
	// Shared-calendar access lives in cal_calendar_shares (a subquery this model
	// can't express) ⇒ shares are deferred, owned calendars are leak-free.
	cal_calendars: {
		orgColumn: calCalendars.organizationId,
		userColumn: calCalendars.ownerUserId,
	},

	// knowledge_documents (notes, type='note' and others): authored docs scoped
	// by created_by_user_id + organization_id. Direct column ⇒ safe.
	knowledge_documents: {
		orgColumn: knowledgeDocuments.organizationId,
		userColumn: knowledgeDocuments.createdByUserId,
	},
};

export function getTableScope(tableName: string): TableScope | null {
	return TABLE_SCOPES[tableName] ?? null;
}

/** Tables that additionally require userId === auth.sub (derived from the
 *  registry's `userColumn` presence — no separate hand-maintained set). */
export function isUserScoped(tableName: string): boolean {
	return Boolean(TABLE_SCOPES[tableName]?.userColumn);
}

/** Column restriction for a table, if any (derived from the registry). */
export function getColumnRestriction(tableName: string): string | undefined {
	return TABLE_SCOPES[tableName]?.columns;
}
