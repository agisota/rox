import { ChatServiceProvider } from "@rox/chat/client";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import type { ChatLaunchConfig } from "shared/tabs-types";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

// The chat-service IPC client backs the model picker's provider-status +
// custom-provider queries (the same client the Settings → Models page uses).
// Created once at module scope so every pane shares one transport.
const chatServiceIpcClient = createChatServiceIpcClient();

export function ChatPane({
	onSessionIdChange,
	sessionId,
	workspaceId,
	initialLaunchConfig,
	onConsumeLaunchConfig,
}: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
	initialLaunchConfig?: ChatLaunchConfig | null;
	onConsumeLaunchConfig?: () => void;
}) {
	const { organizationId, workspacePath, handleNewChat, getOrCreateSession } =
		useWorkspaceChatController({
			onSessionIdChange,
			sessionId,
			workspaceId,
		});

	return (
		<ChatServiceProvider
			client={chatServiceIpcClient}
			queryClient={electronQueryClient}
		>
			<WorkspaceChatInterface
				getOrCreateSession={getOrCreateSession}
				initialLaunchConfig={initialLaunchConfig ?? null}
				onConsumeLaunchConfig={onConsumeLaunchConfig}
				isFocused
				onResetSession={handleNewChat}
				sessionId={sessionId}
				workspaceId={workspaceId}
				organizationId={organizationId}
				cwd={workspacePath}
			/>
		</ChatServiceProvider>
	);
}
