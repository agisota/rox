/**
 * `@rox/shared/host-client` — the unified, transport-agnostic HostClient
 * contract (WS-B T1). Frozen boundary consumed by web, mobile (WS-G), and the
 * desktop renderer (WS-A). See `./types.ts` for the full contract and
 * `plans/rox-convergence/DECISIONS.md` (D5/D6) for the ownership + read-plane
 * decisions.
 */

export { createHostClient } from "./create-host-client";
export type {
	CreateHostTerminalOptions,
	HostAgentConfig,
	HostAgentConfigsNamespace,
	HostChatMessage,
	HostChatNamespace,
	HostClient,
	HostDbNamespace,
	HostFileEntry,
	HostFilesystemNamespace,
	HostGitFileStatus,
	HostGitNamespace,
	HostGitStatus,
	HostKind,
	HostTarget,
	HostTerminalCreateResult,
	HostTerminalNamespace,
	HostTerminalSession,
	HostTransport,
	HostTransportKind,
	HostWorkspaceNamespace,
	HostWorkspaceSummary,
} from "./types";
