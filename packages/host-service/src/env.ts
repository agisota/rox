import { randomBytes } from "node:crypto";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		HOST_SERVICE_SECRET: z
			.string()
			.min(1)
			.default(randomBytes(32).toString("hex")),
		ORGANIZATION_ID: z.string().min(1),
		HOST_DB_PATH: z.string().min(1),
		HOST_MIGRATIONS_FOLDER: z.string().min(1),
		AUTH_TOKEN: z.string().min(1),
		ROX_AUTH_CONFIG_PATH: z.string().min(1).optional(),
		ROX_API_URL: z.string().url(),
		CORS_ORIGINS: z
			.string()
			.transform((s) => s.split(",").map((o) => o.trim()))
			.optional(),
		PORT: z.coerce.number().int().positive().default(4879),
		RELAY_URL: z.string().url().optional(),
		// Set by managed provisioners on ephemeral sandboxes (remote-hosts epic,
		// #32). ISO-8601 instant at which this sandbox's TTL elapses; host-service
		// gracefully shuts down at that time so the host transitions offline.
		SANDBOX_EXPIRES_AT: z.string().datetime().optional(),
		// Cross-host agent-state sync (@rox/agent-state, WS-D). All optional:
		// absence of AGENT_STATE_DB_PATH disables the layer entirely (zero
		// behavior change). With a path but no TURSO_SYNC_URL it runs pure-local
		// (offline-first). With both it is an embedded replica of a Turso primary.
		AGENT_STATE_DB_PATH: z.string().min(1).optional(),
		TURSO_SYNC_URL: z.string().url().optional(),
		TURSO_AUTH_TOKEN: z.string().min(1).optional(),
		TURSO_AUTH_TOKEN_KEY: z.string().min(1).optional(),
		AGENT_STATE_SYNC_INTERVAL_MS: z.string().min(1).optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
