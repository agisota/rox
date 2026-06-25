/**
 * Adapter B — chat-runtime IPC transport (`chatRuntimeServiceTrpc.session.*`).
 *
 * Backs the legacy mosaic chat pane. The chat-runtime client splits live state
 * across two queries (`session.getDisplayState` + `session.listMessages`)
 * rather than one combined snapshot, and commands live under
 * `session.{stop,abort,approval,question,plan}` + `session.restartFromMessage`.
 * This is the path that previously lived inline inside the `@rox/chat/client`
 * `useChatDisplay`.
 *
 * Bound to `{ cwd, sessionId }`: every chat-runtime procedure is scoped by
 * `sessionId` (+ optional `cwd`).
 */

import { chatRuntimeServiceTrpc, chatServiceTrpc } from "@rox/chat/client";
import type { ChatRuntimeServiceRouter } from "@rox/chat/server/trpc";
import { skipToken } from "@tanstack/react-query";
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

type SessionOutputs = inferRouterOutputs<ChatRuntimeServiceRouter>["session"];
type SessionSendInput =
	inferRouterInputs<ChatRuntimeServiceRouter>["session"]["sendMessage"];
/** Committed message shape exposed by the chat-runtime `listMessages` query. */
export type ChatRuntimeMessage = SessionOutputs["listMessages"][number];
/** Display-state shape from the chat-runtime `getDisplayState` query. */
type ChatRuntimeDisplayState = SessionOutputs["getDisplayState"];

function toRefetchIntervalMs(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return Math.floor(1000 / 60);
	return Math.max(16, Math.floor(1000 / fps));
}

export function useChatRuntimeChatTransport(args: {
	cwd?: string;
	sessionId: string | null;
}): ChatTransport<ChatRuntimeMessage, ChatRuntimeDisplayState> {
	const { cwd, sessionId } = args;
	const utils = chatRuntimeServiceTrpc.useUtils();
	const serviceUtils = chatServiceTrpc.useUtils();

	return useMemo<
		ChatTransport<ChatRuntimeMessage, ChatRuntimeDisplayState>
	>(() => {
		const sessionScope = sessionId
			? { sessionId, ...(cwd ? { cwd } : {}) }
			: null;

		const useSnapshot = ({
			sessionId: snapshotSessionId,
			enabled,
			fps,
		}: UseChatSnapshotOptions): ChatDisplaySnapshot<
			ChatRuntimeMessage,
			ChatRuntimeDisplayState
		> => {
			const queryInput = snapshotSessionId
				? { sessionId: snapshotSessionId, ...(cwd ? { cwd } : {}) }
				: skipToken;
			const isQueryEnabled = enabled && Boolean(snapshotSessionId);
			const queryOptions = {
				enabled: isQueryEnabled,
				refetchInterval: toRefetchIntervalMs(fps),
				refetchIntervalInBackground: true,
				refetchOnWindowFocus: false,
			} as const;

			const displayQuery =
				chatRuntimeServiceTrpc.session.getDisplayState.useQuery(
					queryInput,
					queryOptions,
				);
			const messagesQuery =
				chatRuntimeServiceTrpc.session.listMessages.useQuery(
					queryInput,
					queryOptions,
				);

			const isConversationLoading =
				isQueryEnabled &&
				messagesQuery.data === undefined &&
				(messagesQuery.isLoading || messagesQuery.isFetching);

			return {
				displayState: (displayQuery.data ??
					null) as ChatRuntimeDisplayState | null,
				historicalMessages: (messagesQuery.data ?? []) as ChatRuntimeMessage[],
				isConversationLoading,
				queryError: displayQuery.error ?? messagesQuery.error ?? null,
			};
		};

		return {
			kind: "chat-runtime",
			useSnapshot,
			send: (sendArgs: ChatSendArgs) => {
				if (!sessionScope) {
					throw new Error("Chat session is still starting. Please retry.");
				}
				return utils.client.session.sendMessage.mutate({
					...sessionScope,
					payload: sendArgs.payload as SessionSendInput["payload"],
					metadata: sendArgs.metadata as SessionSendInput["metadata"],
				});
			},
			restart: (restartArgs: ChatRestartArgs) => {
				if (!sessionScope) {
					throw new Error("Chat session is still starting. Please retry.");
				}
				return utils.client.session.restartFromMessage.mutate({
					...sessionScope,
					messageId: restartArgs.messageId,
					payload: restartArgs.payload as SessionSendInput["payload"],
					metadata: restartArgs.metadata as SessionSendInput["metadata"],
				});
			},
			stop: () => {
				if (!sessionScope) return Promise.resolve();
				return utils.client.session.stop.mutate(sessionScope);
			},
			respondToApproval: (approvalArgs: ChatApprovalArgs) => {
				if (!sessionScope) return Promise.resolve();
				return utils.client.session.approval.respond.mutate({
					...sessionScope,
					...approvalArgs,
				});
			},
			respondToPlan: (planArgs: ChatPlanArgs) => {
				if (!sessionScope) return Promise.resolve();
				return utils.client.session.plan.respond.mutate({
					...sessionScope,
					...planArgs,
				});
			},
			respondToQuestion: (questionArgs: ChatQuestionArgs) => {
				if (!sessionScope) return Promise.resolve();
				return utils.client.session.question.respond.mutate({
					...sessionScope,
					...questionArgs,
				});
			},
			listMessages: () => {
				if (!sessionScope) return Promise.resolve([]);
				return utils.client.session.listMessages
					.query(sessionScope)
					.then((messages) => (messages ?? []) as ChatRuntimeMessage[]);
			},
			getSlashCommands: () =>
				serviceUtils.workspace.getSlashCommands.fetch({ cwd: cwd ?? "" }),
			getMcpOverview: (rootCwd: string) => {
				if (!sessionScope) {
					return Promise.resolve({ sourcePath: null, servers: [] });
				}
				return utils.client.workspace.getMcpOverview.query({
					sessionId: sessionScope.sessionId,
					cwd: rootCwd,
				});
			},
		};
	}, [cwd, sessionId, serviceUtils, utils]);
}
