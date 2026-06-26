import { mkdir } from "node:fs/promises";
import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { ChatService } from "@rox/chat/server/desktop";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { AgentBridgeRegistry } from "./agent-bridge";
import { createApiClient } from "./api";
import { createDb, type HostDb } from "./db";
import { EventBus, GitWatcher, registerEventBusRoute } from "./events";
import { logger } from "./lib/logger";
import type { ApiAuthProvider } from "./providers/auth";
import type { HostAuthProvider } from "./providers/host-auth";
import type { ModelProviderRuntimeResolver } from "./providers/model-providers";
import { AgentPreinstaller } from "./runtime/agent-preinstall";
import { createServiceTokenClaimTransport } from "./runtime/agent-state/claim-client";
import { startAgentStateRuntime } from "./runtime/agent-state/runtime";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { OutboxSyncManager } from "./runtime/outbox-sync";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import { TerminalAgentStore } from "./terminal-agents";
import { appRouter } from "./trpc/router";
import { seedLocalFirstCreateDefault } from "./trpc/router/settings/host-settings";
import { defaultWorktreesRoot } from "./trpc/router/workspace-creation/shared/worktree-paths";
import {
	execGh as defaultExecGh,
	type ExecGh,
} from "./trpc/router/workspace-creation/utils/exec-gh";
import type { ApiClient } from "./types";

export interface CreateAppOptions {
	config: {
		organizationId: string;
		dbPath: string;
		cloudApiUrl: string;
		migrationsFolder: string;
		allowedOrigins: string[];
	};
	providers: {
		auth: ApiAuthProvider;
		hostAuth: HostAuthProvider;
		credentials: GitCredentialProvider;
		modelResolver: ModelProviderRuntimeResolver;
	};
	/**
	 * Test-harness override hooks. Production never sets these — `createApp`
	 * builds each subsystem itself when omitted. `db` is overridden so tests
	 * can swap in `bun:sqlite` (better-sqlite3 isn't loadable under Bun;
	 * prod uses it on bundled Node). `api`, `github`, `chatRuntime`, and
	 * `chatService` are overridden to keep tests off the network and out of
	 * mastra storage.
	 */
	db?: HostDb;
	api?: ApiClient;
	/**
	 * Injectable git factory. Production omits it (built from the credential
	 * provider). Tests override it to force a LOCAL git failure (e.g. assert the
	 * local-first create still enqueues the project-create when the workspace
	 * step throws).
	 */
	git?: GitFactory;
	github?: () => Promise<Octokit>;
	execGh?: ExecGh;
	chatRuntime?: ChatRuntimeManager;
	chatService?: ChatService;
	/**
	 * Injectable agent preinstaller. Production omits it so `createApp` builds
	 * one with the real shell `CommandRunner`. Tests MUST inject a stub: the
	 * default runner shells out (5-min timeout per item) from the fire-and-forget
	 * `runAuto()` bootstrap below, and on a runner without the agent binaries
	 * preinstalled that real install starves the suite's git subprocesses and
	 * leaks child processes — which is what hung the integration tests in CI.
	 */
	agentPreinstaller?: AgentPreinstaller;
	/**
	 * Run one-time first-launch setting seeds at startup (currently: enable
	 * instant local-first create when the user has never chosen). Production
	 * (`serve.ts`) sets this `true`. Defaults to false (omitted) so the test
	 * harness boots with the schema/getter defaults untouched — keeping the
	 * create-path regression tests on the OFF synchronous-cloud path. Each seed
	 * is itself idempotent and never overrides an explicit user choice.
	 */
	seedDefaults?: boolean;
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	api: ApiClient;
	db: HostDb;
	/**
	 * The local-first outbox sync worker. Exposed so a test harness can drive a
	 * deterministic `drainOnce()` instead of racing the 15s poll interval; the
	 * worker is already `start()`ed and `stop()`ped by `dispose()`. Production
	 * callers don't need to touch it.
	 */
	outboxSync: OutboxSyncManager;
	dispose: () => Promise<void>;
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const api =
		options.api ??
		createApiClient(config.cloudApiUrl, providers.auth, config.organizationId);
	const db = options.db ?? createDb(config.dbPath, config.migrationsFolder);

	// One-time enablement seed for instant local-first create. Runs AFTER
	// migrations (createDb migrates) and synchronously BEFORE the server starts
	// serving create calls, so a fresh real install gets offline-first create on
	// its very first project. Idempotent and kill-switch-safe: it only writes
	// when the `local_first_create` column is null (never chosen), so an explicit
	// user OFF (or a prior seed's ON) is never overridden and survives restarts.
	// The schema/getter DEFAULT stays OFF — only the seeded row value changes
	// runtime behavior.
	//
	// OPT-IN (`seedDefaults`): production (`serve.ts`) passes `true`. The test
	// harness leaves it false so the create-path REGRESSION tests, which rely on
	// the OFF getter default rather than setting the flag explicitly, keep
	// exercising the synchronous-cloud path. Tests that want the seeded behavior
	// call `seedLocalFirstCreateDefault(db)` themselves (see the seed suites).
	if (options.seedDefaults) {
		try {
			const seeded = seedLocalFirstCreateDefault(db);
			if (seeded) {
				logger.info(
					"[host-service] seeded localFirstCreate=ON (first launch, no prior user choice)",
				);
			}
		} catch (err) {
			// Never let a seed write brick startup; create simply stays on today's
			// proven synchronous-cloud path (the OFF default) if this somehow throws.
			logger.warn("[host-service] localFirstCreate seed failed:", err);
		}
	}

	const git = options.git ?? createGitFactory(providers.credentials);
	const github =
		options.github ??
		(async () => {
			const token = await providers.credentials.getToken("github.com");
			if (!token) {
				throw new Error(
					"No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or authenticate via git credential manager.",
				);
			}
			return new Octokit({ auth: token });
		});
	const execGh: ExecGh = options.execGh ?? defaultExecGh;

	const filesystem = new WorkspaceFilesystemManager({ db });
	// GitWatcher is the single source of truth for `.git/` and worktree fs
	// activity per workspace. Both EventBus (broadcasts to clients) and the
	// pull-requests runtime (event-driven branch sync) subscribe to it.
	const gitWatcher = new GitWatcher(db, filesystem);
	gitWatcher.start();
	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		execGh,
		git,
		github,
		gitWatcher,
	});
	pullRequestRuntime.start();
	const chatRuntime =
		options.chatRuntime ??
		new ChatRuntimeManager({
			db,
			runtimeResolver: providers.modelResolver,
		});
	// Provider auth (Anthropic / OpenAI OAuth + API keys) is per-machine, not
	// per-workspace. ChatService is a long-lived singleton wrapping mastra's
	// auth storage; the `host.auth.*` router proxies to it.
	const chatService = options.chatService ?? new ChatService();

	const preinstall = options.agentPreinstaller ?? new AgentPreinstaller({ db });

	// Cross-host agent-state coordination (@rox/agent-state, WS-D). Opt-in via
	// env: with no AGENT_STATE_DB_PATH this is a disabled no-op (service=null),
	// so unset env means zero behavior change. Construction is synchronous; the
	// libSQL replica opens in the background, mirroring the other fire-and-forget
	// bootstraps above. Disposed in `dispose()` below.
	//
	// Strict single-writer claims are NEVER resolved by libSQL LWW — they go
	// through the cloud `runtime.claim` CAS lease via a service-token transport.
	// Wiring is opt-in on RUNTIME_SERVICE_TOKEN: without it the claim path stays
	// unwired and claims degrade to `{ ok: false, reason: "claims-not-wired" }`
	// (graceful refusal, never an incorrect grant).
	const claimTransport = createServiceTokenClaimTransport({
		cloudApiUrl: config.cloudApiUrl,
		serviceToken: process.env.RUNTIME_SERVICE_TOKEN ?? "",
		onError: (error) =>
			logger.warn("[host-service] agent-state claim transport failed:", error),
	});
	const agentState = startAgentStateRuntime({
		env: process.env,
		claimTransport,
	});

	const runtime = {
		auth: chatService,
		chat: chatRuntime,
		filesystem,
		pullRequests: pullRequestRuntime,
		preinstall,
		agentState,
	};
	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

	app.use(
		"*",
		cors({
			origin: config.allowedOrigins,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"trpc-accept",
				"x-rox-client-machine-id",
			],
		}),
	);

	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	eventBus.start();

	const agentBridge = new AgentBridgeRegistry();
	const terminalAgentStore = new TerminalAgentStore();

	// Backfill `kind='main'` v2 workspaces for projects already set up before
	// this column shipped. Idempotent; runs in the background so it doesn't
	// block server startup. Tracked so `dispose()` can await it before closing
	// the db — otherwise a still-pending task hits a closed handle and throws
	// `Cannot use a closed database` (esp. under shared test processes).
	// Aborted by `dispose()` so the loops below stop touching `db` promptly
	// instead of blocking teardown on slow, real install commands.
	const bootstrapAbort = new AbortController();
	const mainWorkspaceSweepTask = runMainWorkspaceSweep({
		api,
		db,
		git,
		organizationId: config.organizationId,
	}).catch((err) => {
		logger.warn("[host-service] main-workspace sweep failed:", err);
	});

	// Local-first create background sync. Drains the `sync_outbox` (deferred
	// cloud project/workspace creates) when the cloud is reachable and links the
	// cloud id back. Inert when nothing is enqueued — the `localFirstCreate`
	// host setting governs whether create ever enqueues — so it's always safe to
	// run. Stopped in `dispose()` before the db closes.
	const outboxSync = new OutboxSyncManager({
		api,
		db,
		organizationId: config.organizationId,
	});
	outboxSync.start();

	// Preinstall bundled agents/harnesses and ensure the default worktrees
	// root exists. Idempotent and fire-and-forget so it never blocks startup;
	// the renderer polls `settings.agentPreinstall.status` for progress.
	// Tracked so `dispose()` awaits it before the db is closed (see above).
	const _preinstallBootstrapTask = (async () => {
		await mkdir(defaultWorktreesRoot(), { recursive: true });
		await preinstall.runAuto({ signal: bootstrapAbort.signal });
	})().catch((err) => {
		logger.warn("[host-service] agent preinstall bootstrap failed:", err);
	});

	const wsAuth: MiddlewareHandler = async (c, next) => {
		const token = c.req.query("token");
		const authorized =
			(await providers.hostAuth.validate(c.req.raw)) ||
			(token && (await providers.hostAuth.validateToken(token)));
		if (!authorized) return c.json({ error: "Unauthorized" }, 401);
		return next();
	};
	app.use("/terminal/*", wsAuth);
	app.use("/events", wsAuth);

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async (_opts, c) => {
				const isAuthenticated = await providers.hostAuth.validate(c.req.raw);
				return {
					git,
					credentials: providers.credentials,
					github,
					execGh,
					api,
					db,
					runtime,
					eventBus,
					agentBridge,
					terminalAgentStore,
					organizationId: config.organizationId,
					isAuthenticated,
					clientMachineId: c.req.header("x-rox-client-machine-id") ?? undefined,
				} as Record<string, unknown>;
			},
		}),
	);

	const ownsDb = options.db === undefined;
	const dispose = async (): Promise<void> => {
		// Signal background bootstrap tasks to stop touching `db`. Both run
		// fire-and-forget and write to the db; closing the SQLite handle out
		// from under an in-flight task throws `RangeError: Cannot use a closed
		// database` (esp. under shared test processes). Once aborted, the
		// preinstall loop stops between items and any trailing state write is a
		// no-op (see AgentPreinstaller.recordState), so it is safe to close the
		// db without blocking dispose on a slow, real install command.
		bootstrapAbort.abort();
		// The sweep is short and also touches `db`; await just that one so the
		// close below can't race its final write. (Already self-catching.)
		await mainWorkspaceSweepTask;
		// Stop the outbox poller before closing the db, so a scheduled drain
		// can't fire against a closed handle. `stop()` clears the interval and
		// flips a guard the in-flight drain checks between rows.
		try {
			outboxSync.stop();
		} catch (err) {
			logger.warn("[host-service] outboxSync.stop failed:", err);
		}
		// Each step is best-effort and isolated: a throw in one cleanup must
		// not skip the others, otherwise a flaky `.stop()` could leak the
		// open SQLite handle for the rest of the process lifetime.
		try {
			pullRequestRuntime.stop();
		} catch (err) {
			logger.warn("[host-service] pullRequestRuntime.stop failed:", err);
		}
		try {
			eventBus.close();
		} catch (err) {
			logger.warn("[host-service] eventBus.close failed:", err);
		}
		try {
			agentBridge.close();
		} catch (err) {
			logger.warn("[host-service] agentBridge.close failed:", err);
		}
		try {
			gitWatcher.close();
		} catch (err) {
			logger.warn("[host-service] gitWatcher.close failed:", err);
		}
		try {
			await agentState.dispose();
		} catch (err) {
			console.warn("[host-service] agentState.dispose failed:", err);
		}
		if (ownsDb) {
			try {
				(db as unknown as { $client?: { close: () => void } }).$client?.close();
			} catch {
				// best-effort close; tests should not fail on teardown
			}
		}
	};

	return { app, injectWebSocket, api, db, outboxSync, dispose };
}
