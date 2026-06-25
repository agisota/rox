import { Database as BunDatabase } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import SuperJSON from "superjson";
import {
	type CreateAppOptions,
	type CreateAppResult,
	createApp,
} from "../../src/app";
import type { HostDb } from "../../src/db";
import * as schema from "../../src/db/schema";
import { AgentPreinstaller } from "../../src/runtime/agent-preinstall";
import type { AppRouter as HostAppRouter } from "../../src/trpc/router";
import {
	createFakeApiClient,
	FakeApiAuthProvider,
	type FakeApiOverrides,
	FakeHostAuthProvider,
	FakeModelResolver,
	MemoryGitCredentialProvider,
} from "./fakes";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

export interface TestHostOptions {
	organizationId?: string;
	cloudApiUrl?: string;
	allowedOrigins?: string[];
	psk?: string;
	apiOverrides?: FakeApiOverrides;
	githubToken?: string | null;
	/**
	 * Fake-runtime overrides typed as `unknown` so tests only need to
	 * implement the methods they exercise — the real surfaces (Octokit,
	 * ChatRuntimeManager, ChatService) are far too large to stub fully.
	 */
	githubFactory?: () => Promise<unknown>;
	execGh?: (args: string[], options?: unknown) => Promise<unknown>;
	chatRuntime?: unknown;
	chatService?: unknown;
	/**
	 * Override the git factory. Typed as `unknown` so a test can inject a minimal
	 * throwing/stub factory without constructing a full `SimpleGit`. Used to force
	 * a LOCAL git failure in the local-first create path.
	 */
	gitFactory?: unknown;
	/**
	 * Reuse an EXISTING sqlite file instead of minting a fresh tmp db. Lets a
	 * reboot-survival test dispose one host and reopen a second host on the SAME
	 * on-disk db (simulating app quit + relaunch). When set, migrations still run
	 * (idempotent) so reopening an already-migrated file is a no-op.
	 */
	dbPath?: string;
	/**
	 * Skip removing the temp data dir on `dispose()`. Pair with `dbPath` so the
	 * first host's dispose leaves the file on disk for the second host to reopen;
	 * the final host (or the test's own cleanup) removes it.
	 */
	keepData?: boolean;
	/**
	 * Run the production first-launch setting seeds in `createApp` (what
	 * `serve.ts` does on a real boot — currently: enable local-first create when
	 * never chosen). Defaults off so existing tests boot with the schema defaults;
	 * the enable-by-default seed suite opts in to exercise the real boot hook.
	 */
	seedDefaults?: boolean;
}

export interface TestHost {
	app: CreateAppResult["app"];
	api: CreateAppResult["api"];
	db: HostDb;
	/** Local-first outbox worker, for deterministic `drainOnce()` in tests. */
	outboxSync: CreateAppResult["outboxSync"];
	dispose: () => Promise<void>;
	psk: string;
	dbPath: string;
	apiCalls: Array<{ path: string; input: unknown }>;
	setApi: (
		path: string,
		impl: (input: unknown) => unknown | Promise<unknown>,
	) => void;

	/** tRPC client that talks to the real Hono app via in-process fetch. */
	trpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** tRPC client without the auth header — for testing 401 paths. */
	unauthenticatedTrpc: ReturnType<typeof createTRPCClient<HostAppRouter>>;
	/** Raw fetch into the app, useful for non-tRPC routes (CORS, websockets). */
	fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
}

/**
 * Boot the host-service `createApp` against an isolated `bun:sqlite` db with
 * fake providers, then return a tRPC client that round-trips through
 * `app.fetch` (no real network or port). Caller must `await dispose()`.
 *
 * `bun:sqlite` is used instead of `better-sqlite3` because Bun can't dlopen
 * the better-sqlite3 native binding (oven-sh/bun#4290). Both back the same
 * drizzle `BaseSQLiteDatabase` API; production still uses better-sqlite3 in
 * the bundled-Node host process.
 */
export async function createTestHost(
	options: TestHostOptions = {},
): Promise<TestHost> {
	const psk = options.psk ?? "test-psk-secret";
	// Reuse a caller-supplied db file (reboot-survival: same file across a
	// dispose/reopen) or mint a fresh isolated tmp db. `dataDir` is only owned
	// (and removed on dispose) when we minted it AND the caller didn't ask to
	// keep it.
	const reuseDbPath = options.dbPath;
	const dataDir = reuseDbPath
		? join(reuseDbPath, "..")
		: mkdtempSync(join(tmpdir(), "host-service-test-db-"));
	const dbPath = reuseDbPath ?? join(dataDir, "host.db");
	const ownsDataDir = !reuseDbPath && !options.keepData;

	const sqlite = new BunDatabase(dbPath, { create: true, readwrite: true });
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	const fakeApi = createFakeApiClient(options.apiOverrides);

	const createOptions: CreateAppOptions = {
		// Off by default: existing tests rely on the schema/getter defaults. The
		// enable-by-default seed suite passes `true` to exercise the real boot seed.
		seedDefaults: options.seedDefaults ?? false,
		config: {
			organizationId:
				options.organizationId ?? "00000000-0000-0000-0000-000000000001",
			dbPath,
			cloudApiUrl: options.cloudApiUrl ?? "http://localhost:0/cloud",
			migrationsFolder: MIGRATIONS_FOLDER,
			allowedOrigins: options.allowedOrigins ?? ["http://localhost:5173"],
		},
		providers: {
			auth: new FakeApiAuthProvider(),
			hostAuth: new FakeHostAuthProvider(psk),
			credentials: new MemoryGitCredentialProvider(options.githubToken ?? null),
			modelResolver: new FakeModelResolver(),
		},
		db: db as unknown as HostDb,
		api: fakeApi.client,
		git: options.gitFactory
			? (options.gitFactory as CreateAppOptions["git"])
			: undefined,
		github: options.githubFactory
			? (options.githubFactory as CreateAppOptions["github"])
			: undefined,
		execGh: options.execGh
			? (options.execGh as CreateAppOptions["execGh"])
			: // Reject by default so unconfigured tests exercise the Octokit
				// fallback rather than shelling to a real `gh` on the host.
				async () => {
					throw new Error("execGh not configured in test");
				},
		chatRuntime: options.chatRuntime as CreateAppOptions["chatRuntime"],
		chatService: options.chatService as CreateAppOptions["chatService"],
		// Stub the agent preinstaller so the fire-and-forget `runAuto()` bootstrap
		// in `createApp` never shells out. The real `defaultCommandRunner` runs
		// install commands with a 5-minute timeout; on CI runners (no agent
		// binaries preinstalled) those real installs starve the suite's git
		// subprocesses and leak child processes, hanging the integration tests.
		agentPreinstaller: new AgentPreinstaller({
			db: db as unknown as HostDb,
			runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			writeConfigFile: async () => {},
		}),
	};

	const result = createApp(createOptions);

	// Hono's `app.fetch(req, env, ctx)` second arg is the Cloudflare-style
	// env binding, NOT a `RequestInit`. Build a proper `Request` first and
	// pass it alone; otherwise tests that supply a pre-built `Request` plus
	// extra `init` would silently see the init ignored.
	const fetchApp = async (
		input: Request | string,
		init?: RequestInit,
	): Promise<Response> => {
		const request =
			typeof input === "string" ? new Request(input, init) : input;
		return result.app.fetch(request);
	};

	const buildClient = (authorized: boolean) =>
		createTRPCClient<HostAppRouter>({
			links: [
				httpBatchLink({
					url: "http://host-service.test/trpc",
					transformer: SuperJSON,
					fetch: async (url, init) => {
						return fetchApp(new Request(url as string, init as RequestInit));
					},
					headers: () => (authorized ? { authorization: `Bearer ${psk}` } : {}),
				}),
			],
		});

	const trpc = buildClient(true);
	const unauthenticatedTrpc = buildClient(false);

	const dispose = async (): Promise<void> => {
		// Run sqlite + temp-dir cleanup in a finally so a thrown
		// `result.dispose()` can't leak the bun:sqlite handle or leave
		// `host-service-test-db-*` directories behind for later runs.
		try {
			await result.dispose();
		} finally {
			try {
				sqlite.close();
			} catch {
				// best-effort
			}
			// Only remove the data dir we own. A reboot-survival test passes
			// `dbPath`/`keepData` so the file outlives this host's dispose and the
			// next host can reopen it; that test removes the dir itself at the end.
			if (ownsDataDir) {
				try {
					rmSync(dataDir, { recursive: true, force: true });
				} catch {
					// best-effort
				}
			}
		}
	};

	return {
		app: result.app,
		api: fakeApi.client,
		db: db as unknown as HostDb,
		outboxSync: result.outboxSync,
		dispose,
		psk,
		dbPath,
		apiCalls: fakeApi.calls,
		setApi: fakeApi.set,
		trpc,
		unauthenticatedTrpc,
		fetch: fetchApp,
	};
}
