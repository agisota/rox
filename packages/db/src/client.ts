import { neon, Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";

import { env } from "./env";
import { configureLocalProxy, isLocalProxy } from "./local-proxy";
import * as schema from "./schema";

config({ path: ".env", quiet: true });

/**
 * Lazily build the drizzle clients on first use rather than at module load.
 *
 * `@rox/db` is imported transitively by packages that run in environments where
 * DB env vars are intentionally absent (desktop host bundles) and by pure
 * dependency-injected tests that never issue a query (e.g. the pipeline
 * `agent-run-service` resolver suite). Eagerly calling `neon(env.DATABASE_URL)`
 * / `new Pool(...)` here read `DATABASE_URL` at import time and threw whenever it
 * was unset — and, in the test runner, the outcome depended on whether some
 * other file's `mock.module("@rox/db/client", …)` happened to register first,
 * making those suites order-dependently flaky.
 *
 * Deferring construction mirrors the same contract `env.ts` enforces with
 * `skipValidation`: nothing touches `DATABASE_URL` until a real query runs. The
 * clients are still singletons (built once, memoised) and the `db` / `dbWs`
 * named exports keep their concrete drizzle types via `Proxy` forwarding.
 */
type Db = ReturnType<typeof drizzle<typeof schema>>;
type DbWs = ReturnType<typeof drizzleWs<typeof schema>>;

let dbInstance: Db | null = null;
let dbWsInstance: DbWs | null = null;
let localProxyConfigured = false;

function ensureLocalProxy(): void {
	if (localProxyConfigured) return;
	localProxyConfigured = true;
	if (isLocalProxy(env.DATABASE_URL)) {
		configureLocalProxy();
	}
}

function getDb(): Db {
	if (!dbInstance) {
		ensureLocalProxy();
		dbInstance = drizzle({
			client: neon(env.DATABASE_URL),
			schema,
			casing: "snake_case",
		});
	}
	return dbInstance;
}

function getDbWs(): DbWs {
	if (!dbWsInstance) {
		ensureLocalProxy();
		dbWsInstance = drizzleWs({
			client: new Pool({ connectionString: env.DATABASE_URL }),
			schema,
			casing: "snake_case",
		});
	}
	return dbWsInstance;
}

export const db = new Proxy({} as Db, {
	get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
	has: (_target, prop) => prop in getDb(),
}) as Db;

export const dbWs = new Proxy({} as DbWs, {
	get: (_target, prop, receiver) => Reflect.get(getDbWs(), prop, receiver),
	has: (_target, prop) => prop in getDbWs(),
}) as DbWs;
