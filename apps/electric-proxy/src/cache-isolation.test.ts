import { describe, expect, test } from "bun:test";
import type { WhereClause } from "./auth";
import { buildUpstreamUrl } from "./electric";
import { addCorsHeaders } from "./index";
import type { Env } from "./types";
import { buildWhereClause } from "./where";

// electric-proxy sets `cf: { cacheEverything: true }` on the upstream fetch, so
// the CDN caches shape responses. Tenant isolation at the cache layer depends on
// (1) `Vary: Authorization` being on every response so the per-tenant auth header
// is part of the cache key, and (2) two different tenants producing materially
// different upstream requests (different `where`/`params`) so a cache HIT can
// never cross tenants. These are pure-unit regressions over the two functions
// that own that contract.

const ENV: Env = {
	AUTH_URL: "https://auth.rox.test",
	ELECTRIC_SHAPE_URL: "https://electric.rox.test/v1/shape",
	ELECTRIC_SECRET: "shape-secret",
};

function requireClause(
	tableName: string,
	organizationId: string,
	organizationIds: string[],
	userId: string,
): WhereClause {
	const clause = buildWhereClause(
		tableName,
		organizationId,
		organizationIds,
		userId,
	);
	if (!clause) {
		throw new Error(`expected a where clause for ${tableName}`);
	}
	return clause;
}

describe("CDN cache isolation", () => {
	test("addCorsHeaders always sets Vary: Authorization", () => {
		const wrapped = addCorsHeaders(new Response("body", { status: 200 }));
		expect(wrapped.headers.get("Vary")).toBe("Authorization");
	});

	test("Vary: Authorization survives content-encoding stripping", () => {
		const wrapped = addCorsHeaders(
			new Response("body", {
				status: 200,
				headers: { "content-encoding": "gzip", "content-length": "4" },
			}),
		);
		expect(wrapped.headers.get("Vary")).toBe("Authorization");
		// Stripped so the body (now decoded by fetch) isn't mislabeled.
		expect(wrapped.headers.get("content-encoding")).toBeNull();
	});

	test("different orgs produce different upstream where params (no cross-tenant cache)", () => {
		const clientUrl = new URL("https://proxy.rox.test/?table=tasks&offset=-1");

		const whereA = requireClause("tasks", "org-A", ["org-A"], "user-A");
		const whereB = requireClause("tasks", "org-B", ["org-B"], "user-B");

		const upstreamA = buildUpstreamUrl(clientUrl, "tasks", whereA, ENV);
		const upstreamB = buildUpstreamUrl(clientUrl, "tasks", whereB, ENV);

		const paramA = upstreamA.searchParams.get("params[1]");
		const paramB = upstreamB.searchParams.get("params[1]");
		expect(paramA).toBe("org-A");
		expect(paramB).toBe("org-B");
		expect(paramA).not.toBe(paramB);
		// The full upstream URLs (the de-facto origin cache key) must differ.
		expect(upstreamA.toString()).not.toBe(upstreamB.toString());
	});

	test("the same org for the same table produces a stable upstream URL", () => {
		const clientUrl = new URL("https://proxy.rox.test/?table=tasks&offset=-1");
		const where = requireClause("tasks", "org-A", ["org-A"], "user-A");

		const first = buildUpstreamUrl(clientUrl, "tasks", where, ENV);
		const second = buildUpstreamUrl(clientUrl, "tasks", where, ENV);
		expect(first.toString()).toBe(second.toString());
	});

	test("user-scoped tables isolate by user as well as org", () => {
		const clientUrl = new URL(
			"https://proxy.rox.test/?table=memory_items&offset=-1",
		);

		const whereU1 = requireClause("memory_items", "org-A", ["org-A"], "user-1");
		const whereU2 = requireClause("memory_items", "org-A", ["org-A"], "user-2");

		const upstreamU1 = buildUpstreamUrl(
			clientUrl,
			"memory_items",
			whereU1,
			ENV,
		);
		const upstreamU2 = buildUpstreamUrl(
			clientUrl,
			"memory_items",
			whereU2,
			ENV,
		);

		expect(upstreamU1.searchParams.get("params[2]")).toBe("user-1");
		expect(upstreamU2.searchParams.get("params[2]")).toBe("user-2");
		expect(upstreamU1.toString()).not.toBe(upstreamU2.toString());
	});
});
