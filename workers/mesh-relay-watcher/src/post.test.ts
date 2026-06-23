import { describe, expect, test } from "bun:test";
import type { RelayWatcherOutboundEvent } from "./contract";
import {
	buildSignedMeshRequest,
	computeMeshSignature,
	MESH_NONCE_HEADER,
	MESH_SIGNATURE_HEADER,
	MESH_TIMESTAMP_HEADER,
	postInboundMesh,
} from "./post";

const EVENT: RelayWatcherOutboundEvent = {
	fromPubkey: "b".repeat(64),
	toPubkey: "a".repeat(64),
	body: "hello over the mesh",
	eventId: "e".repeat(64),
	kind: 14,
};

const SECRET = "shared-mesh-inbound-secret";

describe("buildSignedMeshRequest", () => {
	test("targets /api/mesh/inbound and stamps the three auth headers", async () => {
		const req = await buildSignedMeshRequest({
			apiUrl: "https://api.rox.one/",
			secret: SECRET,
			event: EVENT,
			now: () => 1_700_000_000_000,
			nonce: () => "nonce-fixed",
		});

		expect(req.url).toBe("https://api.rox.one/api/mesh/inbound");
		expect(req.headers[MESH_TIMESTAMP_HEADER]).toBe("1700000000000");
		expect(req.headers[MESH_NONCE_HEADER]).toBe("nonce-fixed");
		// The signature is over the EXACT serialized body the server will read.
		const expected = await computeMeshSignature(SECRET, req.body);
		expect(req.headers[MESH_SIGNATURE_HEADER]).toBe(expected);
	});

	test("signature verifies under the server's own HMAC recompute (round-trip)", async () => {
		const req = await buildSignedMeshRequest({
			apiUrl: "https://api.rox.one",
			secret: SECRET,
			event: EVENT,
		});
		// Recompute exactly like apps/api/src/lib/mesh/verify.ts would.
		const serverRecompute = await computeMeshSignature(SECRET, req.body);
		expect(req.headers[MESH_SIGNATURE_HEADER]).toBe(serverRecompute);

		// A tampered body must NOT match the stamped signature.
		const tampered = await computeMeshSignature(SECRET, `${req.body} `);
		expect(tampered).not.toBe(req.headers[MESH_SIGNATURE_HEADER]);
	});

	test("body is valid JSON the server can parse", async () => {
		const req = await buildSignedMeshRequest({
			apiUrl: "https://api.rox.one",
			secret: SECRET,
			event: EVENT,
		});
		const parsed = JSON.parse(req.body);
		expect(parsed.fromPubkey).toBe(EVENT.fromPubkey);
		expect(parsed.body).toBe(EVENT.body);
	});
});

describe("postInboundMesh", () => {
	test("returns the ingest status (200 accepted) via injected fetch", async () => {
		let seenUrl = "";
		let seenBody = "";
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			seenUrl = String(url);
			seenBody = String(init?.body);
			return new Response(JSON.stringify({ accepted: true }), { status: 200 });
		}) as unknown as typeof fetch;

		const res = await postInboundMesh({
			apiUrl: "https://api.rox.one",
			secret: SECRET,
			event: EVENT,
			fetchImpl,
		});

		expect(res.status).toBe(200);
		expect(res.ok).toBe(true);
		expect(seenUrl).toBe("https://api.rox.one/api/mesh/inbound");
		expect(JSON.parse(seenBody).body).toBe(EVENT.body);
	});

	test("surfaces a 409 duplicate without throwing", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ duplicate: true }), {
				status: 409,
			})) as unknown as typeof fetch;
		const res = await postInboundMesh({
			apiUrl: "https://api.rox.one",
			secret: SECRET,
			event: EVENT,
			fetchImpl,
		});
		expect(res.status).toBe(409);
	});
});
