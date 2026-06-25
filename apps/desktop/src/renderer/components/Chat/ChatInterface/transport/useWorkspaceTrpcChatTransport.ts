/**
 * Adapter A — host-service transport (`workspaceTrpc.chat.*`).
 *
 * Backs the v2 workspace chat pane. Snapshots come from `chat.getSnapshot`
 * (which carries `displayState` + `messages` + `boot` cold-start state); the
 * commands map straight onto the host-service chat mutations. This is the path
 * that previously lived inline inside `useWorkspaceChatDisplay`.
 *
 * Bound to `{ workspaceId, sessionId }`: session-scoped commands (stop /
 * respondTo*) need the active session id, which the snapshot subscription also
 * keys on.
 */

import type { AppRouter } from "@rox/host-service";
import { workspaceTrpc } from "@rox/workspace-client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo } from "react";
import type {
	ChatApprovalArgs,
	ChatDisplaySnapshot,
	ChatPlanArgs,
	ChatQuestionArgs,
	ChatRestartArgs,
	ChatSendArgs,
	ChatTransport,
	UseChatSnapshotOptions,
} from "./types";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;
type ChatOutputs = RouterOutputs["chat"];
type SnapshotOutput = ChatOutputs["getSnapshot"];
type ListMessagesOutput = SnapshotOutput["messages"];
export type WorkspaceChatMessage = ListMessagesOutput[number];
type SnapshotDisplayState = NonNullable<SnapshotOutput["displayState"]>;
type SendPayload = RouterInputs["chat"]["sendMessage"]["payload"];
type SendMetadata = RouterInputs["chat"]["sendMessage"]["metadata"];

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

function noSession(op: string): never {
	throw new Error(
		`Chat session is still starting (operation "${op}" requires an active session).`,
	);
}

export function useWorkspaceTrpcChatTransport(args: {
	workspaceId: string;
	sessionId: string | null;
}): ChatTransport<WorkspaceChatMessage, SnapshotDisplayState> {
	const { workspaceId, sessionId } = args;
	const utils = workspaceTrpc.useUtils();
	const sendMessageMutation = workspaceTrpc.chat.sendMessage.useMutation();
	const restartFromMessageMutation =
		workspaceTrpc.chat.restartFromMessage.useMutation();
	const stopMutation = workspaceTrpc.chat.stop.useMutation();
	const respondToApprovalMutation =
		workspaceTrpc.chat.respondToApproval.useMutation();
	const respondToQuestionMutation =
		workspaceTrpc.chat.respondToQuestion.useMutation();
	const respondToPlanMutation = workspaceTrpc.chat.respondToPlan.useMutation();

	return useMemo<
		ChatTransport<WorkspaceChatMessage, SnapshotDisplayState>
	>(() => {
		const sessionScope = sessionId ? { sessionId, workspaceId } : null;
		const useSnapshot = ({
			sessionId: snapshotSessionId,
			enabled,
			fps,
		}: UseChatSnapshotOptions): ChatDisplaySnapshot<
			WorkspaceChatMessage,
			SnapshotDisplayState
		> => {
			const queryInput =
				snapshotSessionId === null
					? undefined
					: { sessionId: snapshotSessionId, workspaceId };
			const isQueryEnabled = enabled && Boolean(snapshotSessionId);
			const snapshotQuery = workspaceTrpc.chat.getSnapshot.useQuery(
				queryInput as { sessionId: string; workspaceId: string },
				{
					enabled: isQueryEnabled && queryInput !== undefined,
					refetchInterval: toRefetchIntervalMs(fps),
					refetchIntervalInBackground: true,
					refetchOnWindowFocus: false,
				},
			);

			const snapshot = snapshotQuery.data ?? null;
			const bootState = snapshot?.boot ?? null;
			const isBooting = bootState?.status === "booting";
			const bootErrorMessage =
				bootState?.status === "failed" &&
				typeof bootState.error === "string" &&
				bootState.error.trim()
					? bootState.error
					: null;
			const isConversationLoading =
				isQueryEnabled &&
				(isBooting ||
					(snapshotQuery.data === undefined &&
						(snapshotQuery.isLoading || snapshotQuery.isFetching)));

			return {
				displayState: (snapshot?.displayState ??
					null) as SnapshotDisplayState | null,
				historicalMessages: (snapshot?.messages ??
					[]) as WorkspaceChatMessage[],
				isConversationLoading,
				queryError: bootErrorMessage ?? snapshotQuery.error ?? null,
			};
		};

		return {
			kind: "workspace-trpc",
			useSnapshot,
			send: (sendArgs: ChatSendArgs) =>
				sendMessageMutation.mutateAsync({
					sessionId: sessionScope?.sessionId ?? noSession("send"),
					workspaceId,
					payload: sendArgs.payload as SendPayload,
					metadata: sendArgs.metadata as SendMetadata,
				}),
			restart: (restartArgs: ChatRestartArgs) =>
				restartFromMessageMutation.mutateAsync({
					sessionId: sessionScope?.sessionId ?? noSession("restart"),
					workspaceId,
					messageId: restartArgs.messageId,
					payload: restartArgs.payload as SendPayload,
					metadata: restartArgs.metadata as SendMetadata,
				}),
			stop: () => {
				if (!sessionScope) return Promise.resolve();
				return stopMutation.mutateAsync(sessionScope);
			},
			respondToApproval: (approvalArgs: ChatApprovalArgs) => {
				if (!sessionScope) return Promise.resolve();
				return respondToApprovalMutation.mutateAsync({
					...sessionScope,
					...approvalArgs,
				});
			},
			respondToPlan: (planArgs: ChatPlanArgs) => {
				if (!sessionScope) return Promise.resolve();
				return respondToPlanMutation.mutateAsync({
					...sessionScope,
					...planArgs,
				});
			},
			respondToQuestion: (questionArgs: ChatQuestionArgs) => {
				if (!sessionScope) return Promise.resolve();
				return respondToQuestionMutation.mutateAsync({
					...sessionScope,
					...questionArgs,
				});
			},
			listMessages: () => {
				if (!sessionScope) return Promise.resolve([]);
				return utils.chat.getSnapshot
					.fetch(sessionScope)
					.then((result) => (result?.messages ?? []) as WorkspaceChatMessage[]);
			},
			getSlashCommands: () =>
				utils.chat.getSlashCommands.fetch({ workspaceId }),
			getMcpOverview: () => {
				if (!sessionScope) {
					return Promise.resolve({ sourcePath: null, servers: [] });
				}
				return utils.chat.getMcpOverview.fetch(sessionScope);
			},
		};
	}, [
		respondToApprovalMutation,
		respondToPlanMutation,
		respondToQuestionMutation,
		restartFromMessageMutation,
		sendMessageMutation,
		sessionId,
		stopMutation,
		utils,
		workspaceId,
	]);
}
