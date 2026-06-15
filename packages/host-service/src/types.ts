import type { Octokit } from "@octokit/rest";
import type { ChatService } from "@rox/chat/server/desktop";
import type { AppRouter } from "@rox/trpc";
import type { TRPCClient } from "@trpc/client";
import type { AgentBridgeRegistry } from "./agent-bridge";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { AgentPreinstaller } from "./runtime/agent-preinstall";
import type { ChatRuntimeManager } from "./runtime/chat";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	auth: ChatService;
	chat: ChatRuntimeManager;
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
	preinstall: AgentPreinstaller;
}

export interface HostServiceContext {
	git: GitFactory;
	credentials: GitCredentialProvider;
	github: () => Promise<Octokit>;
	execGh: ExecGh;
	api: ApiClient;
	db: HostDb;
	runtime: HostServiceRuntime;
	eventBus: EventBus;
	agentBridge: AgentBridgeRegistry;
	terminalAgentStore: TerminalAgentStore;
	organizationId: string;
	isAuthenticated: boolean;
	clientMachineId?: string;
}
