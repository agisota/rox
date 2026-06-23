import { describe, expect, test } from "bun:test";
import {
	computeMeshSignature,
	MAX_SKEW_MS,
	verifyMeshSignature,
} from "./verify";

const SECRET = "mesh-test-secret";
const BODY = JSON.stringify({ fromPubkey: "a".repeat(64), body: "hi" });

async function headersFor(over: Partial<Record<string, string>> = {}) {
	const now = Date.now();
	return {
		signature: over.signature ?? (await computeMeshSignature(SECRET, BODY)),
		timestamp: over.timestamp ?? String(now),
		nonce: over.nonce ?? "nonce-1",
	};
}

describe("verifyMeshSignature", () => {
	test("accepts a valid signature within the skew window", async () => {
		const res = await verifyMeshSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor(),
		});
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.nonce).toBe("nonce-1");
	});

	test("rejects a bad signature", async () => {
		const res = await verifyMeshSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ signature: "deadbeef" }),
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects missing headers", async () => {
		const res = await verifyMeshSignature({
			secret: SECRET,
			body: BODY,
			headers: { signature: null, timestamp: null, nonce: null },
		});
		expect(res).toMatchObject({ ok: false, reason: "missing_headers" });
	});

	test("rejects a stale timestamp (replay window)", async () => {
		const stale = String(Date.now() - MAX_SKEW_MS - 1000);
		const res = await verifyMeshSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor({ timestamp: stale }),
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});
});
