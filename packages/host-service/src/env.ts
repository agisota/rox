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
		// Static API key / JWT for self-managed hosts. Optional because managed
		// sandboxes authenticate via RELAY_BOOTSTRAP_TOKEN (C5/D7) and desktop
		// hosts via ROX_AUTH_CONFIG_PATH instead; serve.ts asserts at least one
		// credential source is present before dialing the relay.
		AUTH_TOKEN: z.string().min(1).optional(),
		ROX_AUTH_CONFIG_PATH: z.string().min(1).optional(),
		// Short-lived relay bootstrap credential injected by the managed
		// provisioner (remote-hosts epic, C5/D7). Lets an ephemeral sandbox dial
		// the relay without an interactive login or a long-lived API key.
		RELAY_BOOTSTRAP_TOKEN: z.string().min(1).optional(),
		// Pre-assigned host id for a managed sandbox. When set, host-service uses
		// it as the machine id instead of deriving one from the local machine, so
		// the relay routing key matches the host row the provisioner created.
		HOST_ID: z.string().min(1).optional(),
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
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
