/**
 * Transport-agnostic {@link HostClient} factory (WS-B T1).
 *
 * Given any {@link HostTransport} (relay for web/mobile/desktop→other machine,
 * ipc for desktop→own host), build the same typed namespace surface. All the
 * UI does is `createHostClient(transport).terminal.createSession(...)` — it
 * never sees the transport again. Procedure names match the host-service tRPC
 * routers (terminal, git, filesystem, chat, settings.agentConfigs).
 */
import type {
	CreateHostTerminalOptions,
	HostAgentConfig,
	HostChatMessage,
	HostClient,
	HostFileEntry,
	HostGitStatus,
	HostTerminalCreateResult,
	HostTerminalSession,
	HostTransport,
	HostWorkspaceSummary,
} from "./types";

export function createHostClient(transport: HostTransport): HostClient {
	return {
		target: transport.target,
		transport,
		terminal: {
			listSessions(workspaceId) {
				return transport.call<{ sessions: HostTerminalSession[] }>(
					"terminal.listSessions",
					{ workspaceId },
					"GET",
				);
			},
			createSession(
				workspaceId: string,
				options: CreateHostTerminalOptions = {},
			) {
				const input =
					options.initialCommand === undefined
						? { workspaceId }
						: { workspaceId, initialCommand: options.initialCommand };
				return transport.call<HostTerminalCreateResult>(
					"terminal.createSession",
					input,
					"POST",
				);
			},
		},
		git: {
			getStatus(workspaceId) {
				return transport.call<HostGitStatus>(
					"git.getStatus",
					{ workspaceId },
					"GET",
				);
			},
			getDiff(workspaceId, path) {
				return transport.call<{ diff: string }>(
					"git.getDiff",
					{ workspaceId, path },
					"GET",
				);
			},
		},
		filesystem: {
			listDirectory(workspaceId, path) {
				return transport.call<{ entries: HostFileEntry[] }>(
					"filesystem.listDirectory",
					{ workspaceId, path },
					"GET",
				);
			},
			readFile(workspaceId, path) {
				return transport.call<{ contents: string }>(
					"filesystem.readFile",
					{ workspaceId, path },
					"GET",
				);
			},
		},
		chat: {
			listMessages(sessionId) {
				return transport.call<{ messages: HostChatMessage[] }>(
					"chat.listMessages",
					{ sessionId },
					"GET",
				);
			},
		},
		workspace: {
			get(workspaceId) {
				return transport.call<HostWorkspaceSummary>(
					"workspace.get",
					{ workspaceId },
					"GET",
				);
			},
		},
		agentConfigs: {
			list() {
				return transport.call<HostAgentConfig[]>(
					"settings.agentConfigs.list",
					undefined,
					"GET",
				);
			},
		},
		db: {
			query<TRow = unknown>(view: string, params?: Record<string, unknown>) {
				return transport.call<{ rows: TRow[] }>(
					"db.query",
					{ view, params },
					"GET",
				);
			},
		},
	};
}
