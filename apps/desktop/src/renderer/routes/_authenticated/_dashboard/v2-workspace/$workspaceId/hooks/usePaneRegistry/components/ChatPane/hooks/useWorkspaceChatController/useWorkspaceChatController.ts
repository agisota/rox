import { workspaceTrpc } from "@rox/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import {
	isDesktopChatDevMode,
	resolveDesktopChatOrganizationId,
} from "renderer/lib/dev-chat";
import { DevChatSessionStore } from "renderer/lib/dev-chat-store";
import { posthog } from "renderer/lib/posthog";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface SessionSelectorItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

function toSessionSelectorItem(session: {
	id: string;
	title: string | null;
	lastActiveAt: Date | string | null;
	createdAt: Date | string;
}): SessionSelectorItem {
	return {
		sessionId: session.id,
		title: session.title ?? "",
		updatedAt:
			session.lastActiveAt instanceof Date
				? session.lastActiveAt
				: session.lastActiveAt
					? new Date(session.lastActiveAt)
					: session.createdAt instanceof Date
						? session.createdAt
						: new Date(session.createdAt),
	};
}

// Durable index for dev-chat sessions. In dev-chat mode there is no real org or
// auth, so sessions are never written to cloud Postgres and never sync down via
// Electric. Persisting them here (renderer localStorage) is what keeps dev chats
// alive across an app quit+relaunch instead of vanishing as in-memory-only state.
const devChatSessionStore = new DevChatSessionStore();

async function createSessionRecord(input: {
	sessionId: string;
	v2WorkspaceId: string;
}): Promise<void> {
	if (isDesktopChatDevMode()) {
		// Persist locally so the chat survives quit+relaunch (data-loss-on-quit fix).
		devChatSessionStore.upsert({
			sessionId: input.sessionId,
			v2WorkspaceId: input.v2WorkspaceId,
		});
		return;
	}
	await apiTrpcClient.chat.createSession.mutate({
		sessionId: input.sessionId,
		v2WorkspaceId: input.v2WorkspaceId,
	});
}

export function useWorkspaceChatController({
	sessionId,
	onSessionIdChange,
	workspaceId,
}: {
	sessionId: string | null;
	onSessionIdChange: (sessionId: string | null) => void;
	workspaceId: string;
}) {
	const { data: session } = authClient.useSession();
	const organizationId = resolveDesktopChatOrganizationId(
		session?.session?.activeOrganizationId,
	);
	const collections = useCollections();
	const endSessionMutation = workspaceTrpc.chat.endSession.useMutation();
	const { chatSessions: chatSessionActions } = useOptimisticCollectionActions();

	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(workspaceId) },
	);

	const { data: allSessionsData } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					eq(chatSessions.v2WorkspaceId, workspaceId),
				)
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections.chatSessions, workspaceId],
	);
	const sessions = allSessionsData ?? [];

	const handleSelectSession = useCallback(
		(nextSessionId: string) => {
			onSessionIdChange(nextSessionId);
		},
		[onSessionIdChange],
	);

	const handleNewChat = useCallback(async () => {
		onSessionIdChange(null);
	}, [onSessionIdChange]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			const transaction = chatSessionActions.deleteSession(sessionIdToDelete);
			if (!transaction && !isDesktopChatDevMode()) {
				throw new Error("Failed to delete chat session");
			}
			if (isDesktopChatDevMode()) {
				// Drop the durable dev record so a deleted chat stays deleted across
				// relaunch (mirror of the persist-on-create path).
				devChatSessionStore.remove(sessionIdToDelete);
			}
			// Tear down the host-service in-memory runtime so it doesn't leak.
			// Failures here must not block the user-visible delete.
			void endSessionMutation
				.mutateAsync({ sessionId: sessionIdToDelete, workspaceId })
				.catch(() => {});

			posthog.capture("chat_session_deleted", {
				workspace_id: workspaceId,
				session_id: sessionIdToDelete,
				organization_id: organizationId,
			});
			if (sessionIdToDelete === sessionId) {
				onSessionIdChange(null);
			}
		},
		[
			chatSessionActions,
			endSessionMutation,
			onSessionIdChange,
			organizationId,
			sessionId,
			workspaceId,
		],
	);

	const getOrCreateSession = useCallback(async (): Promise<string> => {
		if (!organizationId) {
			throw new Error("Нет активной организации");
		}

		if (sessionId) {
			if (sessions.some((item) => item.id === sessionId)) {
				return sessionId;
			}

			await createSessionRecord({
				sessionId,
				v2WorkspaceId: workspaceId,
			});
			return sessionId;
		}

		const nextSessionId = crypto.randomUUID();
		await createSessionRecord({
			sessionId: nextSessionId,
			v2WorkspaceId: workspaceId,
		});
		onSessionIdChange(nextSessionId);
		posthog.capture("chat_session_created", {
			workspace_id: workspaceId,
			session_id: nextSessionId,
			organization_id: organizationId,
		});
		return nextSessionId;
	}, [onSessionIdChange, organizationId, sessionId, sessions, workspaceId]);

	const sessionItems = useMemo(() => {
		const nextItems = sessions.map((item) => toSessionSelectorItem(item));
		if (!isDesktopChatDevMode()) {
			return nextItems;
		}

		// Dev-chat mode: the Electric-backed `sessions` list is always empty (no
		// org/auth → no cloud write → no sync). Source the list from the durable
		// local store instead, so chats created in a previous app run reappear
		// after quit+relaunch rather than being lost. The currently-active
		// `sessionId` is always included even before its first persisted write.
		const byId = new Map<string, SessionSelectorItem>();
		for (const item of nextItems) {
			byId.set(item.sessionId, item);
		}
		for (const record of devChatSessionStore.listByWorkspace(workspaceId)) {
			if (byId.has(record.sessionId)) continue;
			byId.set(record.sessionId, {
				sessionId: record.sessionId,
				title: record.title,
				updatedAt: new Date(record.lastActiveAt),
			});
		}
		if (sessionId && !byId.has(sessionId)) {
			byId.set(sessionId, {
				sessionId,
				title: "",
				updatedAt: new Date(),
			});
		}
		return [...byId.values()].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}, [sessionId, sessions, workspaceId]);

	return {
		sessionId,
		organizationId,
		workspacePath: workspace?.worktreePath ?? "",
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleDeleteSession,
		getOrCreateSession,
	};
}
