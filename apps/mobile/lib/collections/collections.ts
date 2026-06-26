import { snakeCamelMapper } from "@electric-sql/client";
import type {
	SelectDurableSession,
	SelectInvitation,
	SelectMember,
	SelectOrganization,
	SelectOrgSettings,
	SelectProject,
	SelectTask,
	SelectTaskStatus,
	SelectTerminal,
	SelectUser,
	SelectUserPreferences,
	SelectV2Workspace,
} from "@rox/db/schema";
import {
	pickOrgSettingsPatch,
	pickUserPreferencesPatch,
} from "@rox/shared/prefs";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { authClient } from "../auth/client";
import { env } from "../env";
import { apiClient } from "../trpc/client";
import { orgCollectionId } from "./collectionId";

const columnMapper = snakeCamelMapper();
const electricUrl = `${env.EXPO_PUBLIC_API_URL}/api/electric/v1/shape`;

interface OrgCollections {
	tasks: Collection<SelectTask>;
	taskStatuses: Collection<SelectTaskStatus>;
	projects: Collection<SelectProject>;
	members: Collection<SelectMember>;
	users: Collection<SelectUser>;
	invitations: Collection<SelectInvitation>;
	v2Workspaces: Collection<SelectV2Workspace>;
	durableSessions: Collection<SelectDurableSession>;
	terminals: Collection<SelectTerminal>;
	userPreferences: Collection<SelectUserPreferences>;
	orgSettings: Collection<SelectOrgSettings>;
}

const collectionsCache = new Map<string, OrgCollections>();

// Organizations collection (global)
const organizationsCollection = createCollection(
	electricCollectionOptions<SelectOrganization>({
		id: "organizations",
		shapeOptions: {
			url: electricUrl,
			params: { table: "auth.organizations" },
			headers: {
				Cookie: () => authClient.getCookie() || "",
			},
			columnMapper,
		},
		getKey: (item) => item.id,
	}),
);

function createOrgCollections(
	organizationId: string,
	userId: string,
): OrgCollections {
	const headers = {
		Cookie: () => authClient.getCookie() || "",
	};

	const tasks = createCollection(
		electricCollectionOptions<SelectTask>({
			id: `tasks-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "tasks", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { original, changes } = transaction.mutations[0];
				const result = await apiClient.task.update.mutate({
					...changes,
					id: original.id,
				});
				return { txid: result.txid };
			},
			onDelete: async ({ transaction }) => {
				const item = transaction.mutations[0].original;
				const result = await apiClient.task.delete.mutate(item.id);
				return { txid: result.txid };
			},
		}),
	);

	const taskStatuses = createCollection(
		electricCollectionOptions<SelectTaskStatus>({
			id: `task_statuses-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "task_statuses", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const projects = createCollection(
		electricCollectionOptions<SelectProject>({
			id: `projects-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "projects", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const members = createCollection(
		electricCollectionOptions<SelectMember>({
			id: `members-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.members", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const users = createCollection(
		electricCollectionOptions<SelectUser>({
			id: `users-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.users", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const invitations = createCollection(
		electricCollectionOptions<SelectInvitation>({
			id: `invitations-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "auth.invitations", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const v2Workspaces = createCollection(
		electricCollectionOptions<SelectV2Workspace>({
			id: orgCollectionId("v2_workspaces", organizationId),
			shapeOptions: {
				url: electricUrl,
				params: { table: "v2_workspaces", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	// FN-016/FN-087 mobile workspace cards: durable Claude sessions + terminals,
	// synced org-scoped (read-only on mobile) so the workspace-detail cards show a
	// live status badge. Same Electric-shape pattern as v2_workspaces.
	const durableSessions = createCollection(
		electricCollectionOptions<SelectDurableSession>({
			id: orgCollectionId("durable_sessions", organizationId),
			shapeOptions: {
				url: electricUrl,
				params: { table: "durable_sessions", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	const terminals = createCollection(
		electricCollectionOptions<SelectTerminal>({
			id: orgCollectionId("terminals", organizationId),
			shapeOptions: {
				url: electricUrl,
				params: { table: "terminals", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
		}),
	);

	// F46 cross-device prefs — same Electric shapes + shared `prefs` mutations as
	// desktop, so a pin/view/locale set on desktop appears here and vice versa.
	const userPreferences = createCollection(
		electricCollectionOptions<SelectUserPreferences>({
			id: `user_preferences-${organizationId}-${userId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "user_preferences", organizationId, userId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { changes } = transaction.mutations[0];
				const patch = pickUserPreferencesPatch(changes.values);
				const result = await apiClient.prefs.update.mutate({
					patch,
					updatedAt: Date.now(),
				});
				return { txid: result.txid };
			},
		}),
	);

	const orgSettings = createCollection(
		electricCollectionOptions<SelectOrgSettings>({
			id: `org_settings-${organizationId}`,
			shapeOptions: {
				url: electricUrl,
				params: { table: "org_settings", organizationId },
				headers,
				columnMapper,
			},
			getKey: (item) => item.id,
			onUpdate: async ({ transaction }) => {
				const { changes } = transaction.mutations[0];
				const patch = pickOrgSettingsPatch(changes.values);
				const result = await apiClient.prefs.updateOrg.mutate({
					patch,
					updatedAt: Date.now(),
				});
				return { txid: result.txid };
			},
		}),
	);

	return {
		tasks,
		taskStatuses,
		projects,
		members,
		users,
		invitations,
		v2Workspaces,
		durableSessions,
		terminals,
		userPreferences,
		orgSettings,
	};
}

export function getCollections(organizationId: string, userId: string) {
	// Cache per (org, user): the user_preferences shape is user-scoped, so it
	// must not be reused across users in one org.
	const cacheKey = `${organizationId}:${userId}`;
	if (!collectionsCache.has(cacheKey)) {
		collectionsCache.set(
			cacheKey,
			createOrgCollections(organizationId, userId),
		);
	}

	const orgCollections = collectionsCache.get(cacheKey);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return {
		...orgCollections,
		organizations: organizationsCollection,
	};
}
