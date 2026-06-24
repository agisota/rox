import { describe, expect, test } from "bun:test";
import {
	computeSegmentSignature,
	MAX_SKEW_MS,
	organizationIdFromRoomName,
	verifySegmentSignature,
} from "./verify";

const SECRET = "transcript-test-secret";
const BODY = JSON.stringify({
	roomName: "org:o1:voice:c1",
	segment: { id: "seg-1", text: "привет" },
});

async function headersFor(over: Partial<Record<string, string>> = {}) {
	const now = Date.now();
	return {
		signature: over.signature ?? (await computeSegmentSignature(SECRET, BODY)),
		timestamp: over.timestamp ?? String(now),
		nonce: over.nonce ?? "nonce-1",
	};
}

describe("verifySegmentSignature", () => {
	test("accepts a valid signature within the skew window", async () => {
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor(),
		});
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.nonce).toBe("nonce-1");
	});

	test("rejects a bad signature", async () => {
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ signature: "deadbeef" }),
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects a signature computed with the wrong secret (tamper-evident)", async () => {
		const forged = await computeSegmentSignature("WRONG-secret", BODY);
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ signature: forged }),
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects when the body was tampered after signing", async () => {
		const sig = await computeSegmentSignature(SECRET, BODY);
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: `${BODY} `, // one byte appended → signature no longer matches
			headers: await headersFor({ signature: sig }),
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects missing headers", async () => {
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: { signature: null, timestamp: null, nonce: null },
		});
		expect(res).toMatchObject({ ok: false, reason: "missing_headers" });
	});

	test("rejects a stale timestamp (replay window)", async () => {
		const stale = String(Date.now() - MAX_SKEW_MS - 1000);
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ timestamp: stale }),
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});

	test("rejects a far-future timestamp (clock-skew abuse)", async () => {
		const future = String(Date.now() + MAX_SKEW_MS + 1000);
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ timestamp: future }),
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});

	test("rejects a non-numeric timestamp", async () => {
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ timestamp: "not-a-number" }),
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});

	test("accepts a mixed-case signature (header normalized to lowercase)", async () => {
		const sig = (await computeSegmentSignature(SECRET, BODY)).toUpperCase();
		const res = await verifySegmentSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ signature: sig }),
		});
		expect(res.ok).toBe(true);
	});
});

describe("organizationIdFromRoomName", () => {
	test("parses the org out of a well-formed voice room name", () => {
		expect(organizationIdFromRoomName("org:o-123:voice:chan-7")).toBe("o-123");
	});

	test("returns null for a malformed room name", () => {
		expect(organizationIdFromRoomName("not-a-room")).toBeNull();
		expect(organizationIdFromRoomName("org::voice:")).toBeNull();
		expect(organizationIdFromRoomName("org:o1:chat:c1")).toBeNull();
	});
});
