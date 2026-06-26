/**
 * v2 workspace chat-display hook.
 *
 * Thin binding over the shared, transport-parameterized `useChatDisplay`:
 * it constructs the host-service ChatTransport (`workspaceTrpc.chat.*`) and
 * delegates ALL optimistic-turn / active-turn-dedup / error-surfacing logic to
 * the single shared hook. The forked copy that used to live here is gone — any
 * future fix to chat display now lives in
 * `renderer/components/Chat/ChatInterface/transport`.
 */

import {
	useChatDisplay as useTransportChatDisplay,
	useWorkspaceTrpcChatTransport,
} from "renderer/components/Chat/ChatInterface/transport";

interface UseChatDisplayOptions {
	sessionId: string | null;
	workspaceId: string;
	enabled?: boolean;
	fps?: number;
}

export function useChatDisplay(options: UseChatDisplayOptions) {
	const { sessionId, workspaceId, enabled = true, fps = 4 } = options;
	const transport = useWorkspaceTrpcChatTransport({ workspaceId, sessionId });
	return useTransportChatDisplay(transport, {
		sessionId,
		enabled,
		fps,
	});
}

export type UseChatDisplayReturn = ReturnType<typeof useChatDisplay>;
