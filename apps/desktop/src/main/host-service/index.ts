/**
 * Workspace Service — Desktop Entry Point
 *
 * Starts the host-service HTTP server on a port assigned by the coordinator.
 * The coordinator polls health.check to know when it's ready.
 */

import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import {
	createApp,
	type HostDb,
	installProcessSafetyNet,
	JwtApiAuthProvider,
	LocalGitCredentialProvider,
	LocalModelProvider,
	PskHostAuthProvider,
} from "@rox/host-service";
import { projects, workspaces } from "@rox/host-service/db";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@rox/host-service/terminal-env";
import { connectRelay } from "@rox/host-service/tunnel";
import { inArray } from "drizzle-orm";
import { loadToken } from "lib/trpc/routers/auth/utils/auth-functions";
import { writeManifest } from "main/lib/host-service-manifest";
import { E2E_CANVAS_FIXTURE } from "shared/constants";
import { shouldBypassAuthForE2E } from "shared/e2e-auth-bypass";
import { env } from "./env";

const SHUTDOWN_GRACE_MS = 3_000;
const WATCHDOG_INTERVAL_MS = 2_000;
const LEGACY_E2E_CANVAS_PROJECT_ID = "e2e-canvas-project";
const LEGACY_E2E_CANVAS_WORKSPACE_ID = "e2e-canvas-workspace";

type Server = ReturnType<typeof serve>;

function getE2ECanvasWorkspaceRoot(): string | null {
	if (
		!shouldBypassAuthForE2E({
			nodeEnv: process.env.NODE_ENV,
			flag: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS,
			scope: process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE,
		})
	) {
		return null;
	}
	const root = process.env.ROX_E2E_CANVAS_WORKSPACE_ROOT;
	if (!root || !existsSync(root)) return null;
	return root;
}

function seedE2ECanvasWorkspace(db: HostDb): void {
	const worktreePath = getE2ECanvasWorkspaceRoot();
	if (!worktreePath) return;
	const branch = process.env.ROX_E2E_CANVAS_WORKSPACE_BRANCH || "main";

	try {
		db.delete(workspaces)
			.where(
				inArray(workspaces.id, [
					LEGACY_E2E_CANVAS_WORKSPACE_ID,
					E2E_CANVAS_FIXTURE.workspaceId,
				]),
			)
			.run();
		db.delete(projects)
			.where(
				inArray(projects.id, [
					LEGACY_E2E_CANVAS_PROJECT_ID,
					E2E_CANVAS_FIXTURE.projectId,
				]),
			)
			.run();
		db.insert(projects)
			.values({
				id: E2E_CANVAS_FIXTURE.projectId,
				repoPath: worktreePath,
				repoProvider: "github",
				repoOwner: "agisota",
				repoName: "rox",
				repoUrl: "https://github.com/agisota/rox",
				remoteName: "origin",
			})
			.onConflictDoUpdate({
				target: projects.id,
				set: {
					repoPath: worktreePath,
				},
			})
			.run();

		db.insert(workspaces)
			.values({
				id: E2E_CANVAS_FIXTURE.workspaceId,
				projectId: E2E_CANVAS_FIXTURE.projectId,
				worktreePath,
				branch,
				upstreamOwner: "agisota",
				upstreamRepo: "rox",
				upstreamBranch: "main",
			})
			.onConflictDoUpdate({
				target: workspaces.id,
				set: {
					projectId: E2E_CANVAS_FIXTURE.projectId,
					worktreePath,
					branch,
				},
			})
			.run();
	} catch (error) {
		console.warn("[host-service] failed to seed e2e Canvas workspace", error);
	}
}

async function main(): Promise<void> {
	// Install the parent watchdog before any awaits so a crash during
	// startup can still reap this child. `serverRef` is filled in once
	// serve() returns; shutdown handles both pre- and post-bind states.
	const serverRef: { current: Server | null } = { current: null };
	let shuttingDown = false;
	const shutdown = (reason: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`[host-service] shutdown (${reason}), draining connections`);
		const server = serverRef.current;
		if (!server) {
			process.exit(0);
		}
		server.close();
		// SSE/WS streams (chat, watchers) ignore server.close() — give in-flight
		// HTTP a brief window, then forcibly tear sockets down.
		const forceExit = setTimeout(() => {
			const httpServer = server as unknown as {
				closeAllConnections?: () => void;
			};
			httpServer.closeAllConnections?.();
			process.exit(0);
		}, SHUTDOWN_GRACE_MS);
		forceExit.unref();
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	// Self-exit if our Electron parent dies without sending SIGTERM
	// (orphan reparenting to init/launchd). CLI-spawned host-services
	// don't set HOST_PARENT_PID and skip this.
	const parentPid = Number(process.env.HOST_PARENT_PID);
	if (Number.isInteger(parentPid) && parentPid > 1) {
		const interval = setInterval(() => {
			if (!isParentAlive(parentPid)) {
				clearInterval(interval);
				shutdown("parent-exit");
			}
		}, WATCHDOG_INTERVAL_MS);
		interval.unref();
	}

	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	const authProvider = new JwtApiAuthProvider({
		// Read fresh from disk every time we need to mint a new JWT, so that
		// re-logins in the desktop renderer (which rewrites auth-token.enc)
		// are picked up without restarting the host-service child. Falls back
		// to the boot-time token if the file is missing for any reason.
		getSessionToken: async () => {
			const { token } = await loadToken();
			return token ?? env.AUTH_TOKEN;
		},
		apiUrl: env.ROX_API_URL,
	});

	const { app, injectWebSocket, api, db } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.ROX_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: [
				`http://localhost:${env.DESKTOP_VITE_PORT}`,
				`http://127.0.0.1:${env.DESKTOP_VITE_PORT}`,
			],
		},
		providers: {
			auth: authProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});
	seedE2ECanvasWorkspace(db);

	const startedAt = Date.now();
	const server = serve(
		{ fetch: app.fetch, port: env.HOST_SERVICE_PORT, hostname: "127.0.0.1" },
		(info: { port: number }) => {
			// Install only after the server is listening so startup throws still
			// reach `main().catch(...)` and exit with a non-zero code.
			installProcessSafetyNet();

			if (env.ORGANIZATION_ID) {
				try {
					writeManifest({
						pid: process.pid,
						endpoint: `http://127.0.0.1:${info.port}`,
						authToken: env.HOST_SERVICE_SECRET,
						startedAt,
						organizationId: env.ORGANIZATION_ID,
					});
				} catch (error) {
					console.error("[host-service] Failed to write manifest:", error);
				}
			}

			if (env.RELAY_URL && env.ORGANIZATION_ID) {
				void connectRelay({
					api,
					relayUrl: env.RELAY_URL,
					localPort: info.port,
					organizationId: env.ORGANIZATION_ID,
					authProvider,
					hostServiceSecret: env.HOST_SERVICE_SECRET,
				});
			}
		},
	);
	serverRef.current = server;
	injectWebSocket(server);
}

function isParentAlive(parentPid: number): boolean {
	try {
		process.kill(parentPid, 0);
		return process.ppid === parentPid;
	} catch {
		return false;
	}
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
