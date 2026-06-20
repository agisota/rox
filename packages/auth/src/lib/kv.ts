import { Redis } from "@upstash/redis";
import { env } from "../env";

/**
 * Shared Upstash Redis (KV) client for the auth package.
 *
 * Single instance reused by every KV consumer in `@rox/auth` (rate limiting,
 * the Telegram replay guard, the Yandex profile handoff) so we don't open a new
 * connection pool per call site. Wired from the required `KV_REST_API_*` env.
 */
export const kv = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
