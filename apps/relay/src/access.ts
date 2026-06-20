import { parseHostRoutingKey } from "@rox/shared/host-routing";
import { LRUCache } from "lru-cache";
import { createApiClient } from "./api-client";
import type { AuthContext } from "./auth";

const ALLOWED_TTL_MS = 15 * 60 * 1000;
const DENIED_TTL_MS = 30 * 1000;

// Cache by (userId, hostId), not (token, hostId). Tokens rotate on every JWT
// refresh while the underlying user→host authorization is stable, so a
// token-keyed cache effectively expires with each refresh and burns
// host.checkAccess calls on the API for no reason.
const allowedCache = new LRUCache<string, true>({
	max: 50_000,
	ttl: ALLOWED_TTL_MS,
});
const deniedCache = new LRUCache<string, true>({
	max: 10_000,
	ttl: DENIED_TTL_MS,
});

export async function checkHostAccess(
	auth: AuthContext,
	token: string,
	hostId: string,
): Promise<boolean> {
	// Short-circuit "not in org" locally: the API does this same check from
	// the JWT before hitting the DB, so the round trip is wasted.
	const parsed = parseHostRoutingKey(hostId);
	if (!parsed) return false;
	if (!auth.organizationIds.includes(parsed.organizationId)) return false;

	const key = `${auth.sub}:${hostId}`;
	if (allowedCache.has(key)) return true;
	if (deniedCache.has(key)) return false;

	try {
		const client = createApiClient(token);
		const result = await client.host.checkAccess.query({ hostId });
		// #34.1: there is no paid-plan gate. Access still requires a per-host
		// `v2_users_hosts` row — `host.checkAccess` ANDs userId+organizationId+hostId
		// (see host.ts) — so org membership alone is NOT sufficient; the org check
		// above is only a cheap local short-circuit before this DB-backed check.
		const ok = result.allowed;
		if (ok) {
			allowedCache.set(key, true);
		} else {
			deniedCache.set(key, true);
		}
		return ok;
	} catch {
		return false;
	}
}
