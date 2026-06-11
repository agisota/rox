import type { AgentNativeEmbedEnvelope } from "@rox/agent-bridge/protocol";
import type { DetectedPort } from "@rox/port-scanner";
import type { AgentIdentity } from "@rox/shared/agent-identity";
import type { FsWatchEvent } from "@rox/workspace-fs/host";
import type { AgentLifecycleEventType } from "./map-event-type.ts";

// ── Server → Client ────────────────────────────────────────────────

export interface FsEventsMessage {
	type: "fs:events";
	workspaceId: string;
	events: FsWatchEvent[];
}

export interface GitChangedMessage {
	type: "git:changed";
	workspaceId: string;
	/**
	 * Worktree-relative paths that changed when the batch was worktree-only.
	 * Absent means a broad git state change (`.git/` activity — commit, index,
	 * refs, or mixed) — consumers should invalidate everything for the
	 * workspace.
	 */
	paths?: string[];
}

export interface AgentLifecycleMessage {
	type: "agent:lifecycle";
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	// Absent when the hook ran without `ROX_AGENT_ID` set (legacy shells
	// or third-party hook configs that bypass our wrappers).
	agent?: AgentIdentity;
	occurredAt: number;
}

export interface TerminalLifecycleMessage {
	type: "terminal:lifecycle";
	workspaceId: string;
	terminalId: string;
	eventType: "exit";
	exitCode: number;
	signal: number;
	occurredAt: number;
}

export interface PortChangedMessage {
	type: "port:changed";
	workspaceId: string;
	eventType: "add" | "remove";
	port: DetectedPort;
	label: string | null;
	occurredAt: number;
}

export interface AgentBridgeUiCommandMessage {
	type: "agent-bridge:ui-command";
	workspaceId: string;
	/**
	 * `agent-native.embed` v1 request envelope carrying a whitelisted
	 * `UiCommand` (`name: "rox.ui-command"`). The renderer validates it again
	 * with `parseUiCommandEnvelope` before executing.
	 */
	envelope: AgentNativeEmbedEnvelope;
}

export interface EventBusErrorMessage {
	type: "error";
	message: string;
}

export type ServerMessage =
	| FsEventsMessage
	| GitChangedMessage
	| AgentLifecycleMessage
	| TerminalLifecycleMessage
	| PortChangedMessage
	| AgentBridgeUiCommandMessage
	| EventBusErrorMessage;

// ── Client → Server ────────────────────────────────────────────────

export interface FsWatchCommand {
	type: "fs:watch";
	workspaceId: string;
}

export interface FsUnwatchCommand {
	type: "fs:unwatch";
	workspaceId: string;
}

export type ClientMessage = FsWatchCommand | FsUnwatchCommand;
