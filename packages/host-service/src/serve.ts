import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getSupervisor, startDaemonBootstrap } from "./daemon";
import { env } from "./env";
import {
	ConfigFileSessionTokenSource,
	JwtApiAuthProvider,
} from "./providers/auth";
import { LocalGitCredentialProvider } from "./providers/git";
import { PskHostAuthProvider } from "./providers/host-auth";
import { LocalModelProvider } from "./providers/model-providers";
import { scheduleSandboxExpiry } from "./runtime/sandbox-expiry";
import { installProcessSafetyNet } from "./safety";
import { initTerminalBaseEnv, resolveTerminalBaseEnv } from "./terminal/env";
import { connectRelay } from "./tunnel";

async function main(): Promise<void> {
	console.log(
		`[host-service] starting (org=${env.ORGANIZATION_ID}, port=${env.PORT}, NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
	);

	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);

	// Fire-and-track: kick off pty-daemon spawn-or-adopt without blocking
	// host-service startup. Terminal request handlers `await
	// waitForDaemonReady(orgId)` before using the supervisor's socket path,
	// so an in-flight bootstrap doesn't race with the first terminal launch.
	// Non-terminal requests (workspaces, git, chat) are unaffected if the
	// daemon takes time to come up or fails entirely.
	startDaemonBootstrap(env.ORGANIZATION_ID);

	const configTokenSource = env.ROX_AUTH_CONFIG_PATH
		? new ConfigFileSessionTokenSource({
				configPath: env.ROX_AUTH_CONFIG_PATH,
				apiUrl: env.ROX_API_URL,
			})
		: null;
	const authProvider = new JwtApiAuthProvider({
		getSessionToken: configTokenSource
			? () => configTokenSource.getSessionToken()
			: async () => env.AUTH_TOKEN,
		onInvalidateCache: configTokenSource
			? () => configTokenSource.invalidateCache()
			: undefined,
		apiUrl: env.ROX_API_URL,
	});

	const { app, injectWebSocket, api } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			cloudApiUrl: env.ROX_API_URL,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: env.CORS_ORIGINS ?? [],
		},
		providers: {
			auth: authProvider,
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});

	// Dev-mode shutdown: kill the daemon on host-service exit so dev
	// iteration on daemon code resets cleanly. Production keeps the
	// daemon detached so PTYs survive host-service restarts.
	// Per the migration plan's D5 decision.
	const isDev = process.env.NODE_ENV === "development";
	if (isDev) {
		let shuttingDown = false;
		const devShutdown = async (signal: NodeJS.Signals) => {
			if (shuttingDown) return;
			shuttingDown = true;
			console.log(
				`[host-service] dev-mode ${signal} — stopping pty-daemon for clean iteration`,
			);
			try {
				await getSupervisor().stop(env.ORGANIZATION_ID);
			} catch (err) {
				console.error(
					"[host-service] dev shutdown: supervisor.stop failed:",
					err,
				);
			} finally {
				process.exit(0);
			}
		};
		process.on("SIGINT", () => void devShutdown("SIGINT"));
		process.on("SIGTERM", () => void devShutdown("SIGTERM"));
	}

	const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
		// Install only after the server is listening so startup throws still
		// reach `main().catch(...)` and exit with a non-zero code.
		installProcessSafetyNet();
		console.log(`[host-service] listening on http://localhost:${info.port}`);

		if (env.RELAY_URL) {
			void connectRelay({
				api,
				relayUrl: env.RELAY_URL,
				localPort: info.port,
				organizationId: env.ORGANIZATION_ID,
				authProvider,
				hostServiceSecret: env.HOST_SERVICE_SECRET,
			});
		}
	});
	injectWebSocket(server);

	// Ephemeral sandbox lifecycle (remote-hosts epic, #32): when host-service
	// runs inside a managed sandbox with a fixed TTL, shut down at expiry so the
	// relay drops the tunnel and the host transitions offline — a defensive
	// backstop independent of the provider's own TTL enforcement.
	if (env.SANDBOX_EXPIRES_AT) {
		const expiresAt = new Date(env.SANDBOX_EXPIRES_AT);
		console.log(
			`[host-service] ephemeral sandbox — expires at ${expiresAt.toISOString()}`,
		);
		let expiring = false;
		const shutdownForExpiry = async () => {
			if (expiring) return;
			expiring = true;
			console.log("[host-service] sandbox TTL reached — shutting down");
			try {
				await getSupervisor().stop(env.ORGANIZATION_ID);
			} catch (err) {
				console.error(
					"[host-service] sandbox expiry: supervisor.stop failed:",
					err,
				);
			} finally {
				process.exit(0);
			}
		};
		scheduleSandboxExpiry({
			expiresAt,
			onExpire: () => void shutdownForExpiry(),
		});
	}
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
