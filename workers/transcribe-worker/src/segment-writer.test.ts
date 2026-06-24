import { describe, expect, test } from "bun:test";

import {
	buildSignedSegmentRequest,
	computeSegmentSignature,
	createSignedSegmentWriter,
	SEGMENT_NONCE_HEADER,
	SEGMENT_SIGNATURE_HEADER,
	SEGMENT_TIMESTAMP_HEADER,
	type SegmentPersistPayload,
} from "./segment-writer";
import type { TranscriptWireSegment } from "./wire";

const wire: TranscriptWireSegment = {
	id: "seg-1",
	speakerIdentity: "user-7",
	speakerName: "Ада",
	text: "привет",
	language: "ru",
	capturedAt: 1234,
};

const payload: SegmentPersistPayload = {
	roomName: "org:o1:voice:c1",
	segment: wire,
};

describe("buildSignedSegmentRequest", () => {
	test("targets /api/voice/segment and trims a trailing slash", async () => {
		const req = await buildSignedSegmentRequest({
			apiUrl: "https://api.rox.one/",
			secret: "s",
			payload,
			now: () => 1000,
			nonce: () => "n-1",
		});
		expect(req.url).toBe("https://api.rox.one/api/voice/segment");
	});

	test("HMACs the EXACT JSON body and sets the three auth headers", async () => {
		const req = await buildSignedSegmentRequest({
			apiUrl: "https://api.rox.one",
			secret: "top-secret",
			payload,
			now: () => 1000,
			nonce: () => "nonce-xyz",
		});
		expect(req.body).toBe(JSON.stringify(payload));
		const expectedSig = await computeSegmentSignature("top-secret", req.body);
		expect(req.headers[SEGMENT_SIGNATURE_HEADER]).toBe(expectedSig);
		expect(req.headers[SEGMENT_TIMESTAMP_HEADER]).toBe("1000");
		expect(req.headers[SEGMENT_NONCE_HEADER]).toBe("nonce-xyz");
		expect(req.headers["content-type"]).toBe("application/json");
	});

	test("the signature is secret-dependent (tamper-evident)", async () => {
		const a = await computeSegmentSignature("secret-a", req_body());
		const b = await computeSegmentSignature("secret-b", req_body());
		expect(a).not.toBe(b);
	});
});

function req_body(): string {
	return JSON.stringify(payload);
}

describe("createSignedSegmentWriter", () => {
	test("POSTs the signed request and parses the echoed row id", async () => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const writer = createSignedSegmentWriter({
			apiUrl: "https://api.rox.one",
			secret: "s",
			now: () => 1,
			nonce: () => "n",
			fetchImpl: (async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(JSON.stringify({ id: "row-77" }), { status: 200 });
			}) as unknown as typeof fetch,
		});

		const result = await writer(payload);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.id).toBe("row-77");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.rox.one/api/voice/segment");
		expect(calls[0]?.init.method).toBe("POST");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers[SEGMENT_SIGNATURE_HEADER]).toBeTruthy();
	});

	test("resolves (id=null) on a non-2xx without throwing", async () => {
		const writer = createSignedSegmentWriter({
			apiUrl: "https://api.rox.one",
			secret: "s",
			fetchImpl: (async () =>
				new Response("nope", { status: 500 })) as unknown as typeof fetch,
		});
		const result = await writer(payload);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(500);
		expect(result.id).toBeNull();
	});

	test("tolerates a non-JSON 2xx body (id=null)", async () => {
		const writer = createSignedSegmentWriter({
			apiUrl: "https://api.rox.one",
			secret: "s",
			fetchImpl: (async () =>
				new Response("ok", { status: 202 })) as unknown as typeof fetch,
		});
		const result = await writer(payload);
		expect(result.ok).toBe(true);
		expect(result.id).toBeNull();
	});
});
