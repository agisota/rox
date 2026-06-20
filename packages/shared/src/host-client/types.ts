/**
 * Unified HostClient contract (WS-B T1 — the FROZEN convergence boundary).
 *
 * One transport-agnostic interface that web, mobile, and the desktop renderer
 * all consume so the UI never branches on how a host is reached. A
 * {@link HostTarget} carries the routing key + which {@link HostTransport} to
 * use; the relay transport (web / mobile / desktop→other machine) and the
 * desktop in-process IPC transport both satisfy the same {@link HostClient}.
 *
 * Decisions baked in (see plans/rox-convergence/DECISIONS.md):
 *  - D5: WS-B owns this abstraction AND its transport. Mobile (WS-G) only
 *    CONSUMES it — it authors no transport.
 *  - D6: web has two read planes. Host-scoped live data (terminal/git/
 *    filesystem/chat/workspace/agentConfigs + the host's local-db views via
 *    {@link HostDbNamespace}) is read THROUGH the host over this contract;
 *    org/account durable data keeps its existing Electric subscriptions and is
 *    NOT part of this contract.
 *
 * Inputs/outputs are typed at the boundary rather than via the host AppRouter:
 * importing `@rox/host-service` drags host-only modules into a web/mobile
 * type-check, so host calls are hand-typed here (the same reason the web's
 * legacy `host-client.ts` hand-typed its calls).
 */

/** How a {@link HostClient} reaches its host. */
export type HostTransportKind = "relay" | "ipc";

/** Lifecycle/provider class of the host being addressed. */
export type HostKind = "local" | "remote" | "sandbox";

/**
 * Everything a transport needs to address one host: the relay routing key
 * (`org:machine`, see `@rox/shared/host-routing`), the transport to dial it
 * with, and the host kind for UI/telemetry. The UI passes a `HostTarget`
 * around; it never branches on `transport`.
 */
export interface HostTarget {
	routingKey: string;
	transport: HostTransportKind;
	kind: HostKind;
}

/** A PTY-backed terminal session on the host. */
export interface HostTerminalSession {
	terminalId: string;
	workspaceId: string;
	exited: boolean;
	title: string | null;
}

/** A launchable agent preset configured on the host. */
export interface HostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
	order: number;
}

export interface CreateHostTerminalOptions {
	initialCommand?: string;
}

export interface HostTerminalCreateResult {
	terminalId: string;
	status: string;
}

/** One changed path in the host workspace's git working tree. */
export interface HostGitFileStatus {
	path: string;
	status: string;
	staged: boolean;
}

export interface HostGitStatus {
	branch: string | null;
	files: HostGitFileStatus[];
}

/** One entry returned by a filesystem listing. */
export interface HostFileEntry {
	name: string;
	path: string;
	kind: "file" | "directory" | "symlink";
}

/** One chat message surfaced from the host's chat/session store. */
export interface HostChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	createdAt: string;
}

/** Durable workspace metadata as the host knows it. */
export interface HostWorkspaceSummary {
	workspaceId: string;
	name: string | null;
	branch: string | null;
}

/**
 * The low-level RPC seam every transport must implement. A transport maps a
 * `(procedure, input, method)` triple to the host and returns the decoded
 * output. The relay transport does `fetch → relay → host-service`; the IPC
 * transport does `trpc-electron → main → HostServiceCoordinator`.
 */
export interface HostTransport {
	readonly kind: HostTransportKind;
	readonly target: HostTarget;
	call<TOutput>(
		procedure: string,
		input: unknown,
		method: "GET" | "POST",
	): Promise<TOutput>;
}

export interface HostTerminalNamespace {
	listSessions(
		workspaceId: string,
	): Promise<{ sessions: HostTerminalSession[] }>;
	createSession(
		workspaceId: string,
		options?: CreateHostTerminalOptions,
	): Promise<HostTerminalCreateResult>;
}

export interface HostGitNamespace {
	getStatus(workspaceId: string): Promise<HostGitStatus>;
	getDiff(workspaceId: string, path: string): Promise<{ diff: string }>;
}

export interface HostFilesystemNamespace {
	listDirectory(
		workspaceId: string,
		path: string,
	): Promise<{ entries: HostFileEntry[] }>;
	readFile(workspaceId: string, path: string): Promise<{ contents: string }>;
}

export interface HostChatNamespace {
	listMessages(sessionId: string): Promise<{ messages: HostChatMessage[] }>;
}

export interface HostWorkspaceNamespace {
	get(workspaceId: string): Promise<HostWorkspaceSummary>;
}

export interface HostAgentConfigsNamespace {
	list(): Promise<HostAgentConfig[]>;
}

/**
 * Host-scoped read access to the host's own local-db views (D6 read plane A).
 * Generic by design: callers name a view + filter and get rows back. The host
 * is the single source of truth; web/mobile do NOT sync this DB via Electric.
 */
export interface HostDbNamespace {
	query<TRow = unknown>(
		view: string,
		params?: Record<string, unknown>,
	): Promise<{ rows: TRow[] }>;
}

/**
 * The unified host surface. Transport-agnostic: the same interface is returned
 * whether the underlying transport is `relay` or `ipc`.
 */
export interface HostClient {
	readonly target: HostTarget;
	readonly transport: HostTransport;
	terminal: HostTerminalNamespace;
	git: HostGitNamespace;
	filesystem: HostFilesystemNamespace;
	chat: HostChatNamespace;
	workspace: HostWorkspaceNamespace;
	agentConfigs: HostAgentConfigsNamespace;
	db: HostDbNamespace;
}
