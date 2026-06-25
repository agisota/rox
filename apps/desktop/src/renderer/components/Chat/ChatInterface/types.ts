import type { UIMessage } from "ai";

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

// Re-export the cross-platform canonical permission mode so the renderer, the
// host-service turn schema, and the runtime all share one definition (see
// `@rox/shared/chat-permission-mode`).
export type { PermissionMode } from "@rox/shared/chat-permission-mode";

export type McpServerState = "enabled" | "disabled" | "invalid";
export type McpServerTransport = "remote" | "local" | "unknown";

export interface McpServerOverviewItem {
	name: string;
	state: McpServerState;
	transport: McpServerTransport;
	target: string;
	connected?: boolean;
	toolCount?: number;
	error?: string;
}

export interface McpOverviewPayload {
	sourcePath: string | null;
	servers: McpServerOverviewItem[];
}

export type InterruptedMessage = {
	id: string;
	sourceMessageId: string;
	parts: UIMessage["parts"];
};

export type InterruptedMessagePreview = {
	id: string;
	parts: UIMessage["parts"];
};

export type StartFreshSessionResult = {
	created: boolean;
	sessionId?: string;
	errorMessage?: string;
};

export interface ChatInterfaceProps {
	sessionId: string | null;
	organizationId: string | null;
	deviceId: string | null;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}
