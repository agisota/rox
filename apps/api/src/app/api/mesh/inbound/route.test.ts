import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { MeshIngestResult } from "@/lib/mesh/ingest";
import { computeMeshSignature } from "@/lib/mesh/verify";

// The ingest's Drizzle impl pulls in `@rox/db/client`; stub it so the route test
// never touches a database. The ingest function itself is stubbed to a fixed
// result so we exercise the route's auth + status mapping in isolation.
mock.module("@/lib/mesh/drizzleDb", () => ({
	createMeshIngestDb: () => ({}),
}));

let nextResult: MeshIngestResult = {
	kind: "accepted",
	messageId: "m1",
	threadId: "t1",
};
mock.module("@/lib/mesh/ingest", () => ({
	ingestInboundMesh: () => Promise.resolve(nextResult),
}));

// The shared nonce store is DB-backed in production; swap it for a pure
// in-memory store so the route test exercises the replay branch.
const seenNonces = new Set<string>();
mock.module("@/lib/mesh/nonceStore", () => ({
	sharedNonceStore: {
		checkAndRecord: async (nonce: string) => {
			if (seenNonces.has(nonce)) return false;
			seenNonces.add(nonce);
			return true;
		},
	},
}));

const { POST } = await import("./route");

const SECRET = "route-test-mesh-secret";
const ENVELOPE = {
	fromPubkey: "b".repeat(64),
	toPubkey: "a".repeat(64),
	body: "hello over nostr",
	eventId: "event-1",
};

async function signedRequest(
	body: string,
	over: { signature?: string; timestamp?: string; nonce?: string } = {},
) {
	const now = Date.now();
	const headers = new Headers({
		"content-type": "application/json",
		"x-rox-mesh-signature":
			over.signature ?? (await computeMeshSignature(SECRET, body)),
		"x-rox-mesh-timestamp": over.timestamp ?? String(now),
		"x-rox-mesh-nonce": over.nonce ?? `nonce-${Math.random()}`,
	});
	return new Request("https://api.rox.one/api/mesh/inbound", {
		method: "POST",
		headers,
		body,
	});
}

beforeEach(() => {
	process.env.MESH_INBOUND_SECRET = SECRET;
	nextResult = { kind: "accepted", messageId: "m1", threadId: "t1" };
});

afterEach(() => {
	process.env.MESH_INBOUND_SECRET = undefined;
});

describe("POST /api/mesh/inbound", () => {
	test("503 when the inbound secret is not configured", async () => {
		process.env.MESH_INBOUND_SECRET = "";
		const res = await POST(await signedRequest(JSON.stringify(ENVELOPE)));
		expect(res.status).toBe(503);
	});

	test("401 on a bad signature", async () => {
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(
			await signedRequest(body, { signature: "deadbeef" }),
		);
		expect(res.status).toBe(401);
	});

	test("401 on missing auth headers", async () => {
		const req = new Request("https://api.rox.one/api/mesh/inbound", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(ENVELOPE),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	test("401 on a replayed nonce", async () => {
		const body = JSON.stringify(ENVELOPE);
		const nonce = "fixed-nonce";
		const first = await POST(await signedRequest(body, { nonce }));
		expect(first.status).toBe(200);
		const second = await POST(await signedRequest(body, { nonce }));
		expect(second.status).toBe(401);
	});

	test("400 on a malformed envelope", async () => {
		const body = JSON.stringify({ not: "an envelope" });
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(400);
	});

	test("200 accepted for a valid event", async () => {
		const res = await POST(await signedRequest(JSON.stringify(ENVELOPE)));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { accepted: boolean };
		expect(json.accepted).toBe(true);
	});

	test("409 duplicate maps from the ingest result (relay redelivery)", async () => {
		nextResult = { kind: "duplicate", eventId: "event-1" };
		const res = await POST(await signedRequest(JSON.stringify(ENVELOPE)));
		expect(res.status).toBe(409);
	});

	test("404 no-such-pubkey maps from the ingest result", async () => {
		nextResult = { kind: "no_such_pubkey" };
		const res = await POST(await signedRequest(JSON.stringify(ENVELOPE)));
		expect(res.status).toBe(404);
	});
});
