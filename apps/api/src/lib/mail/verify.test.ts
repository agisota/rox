import { describe, expect, test } from "bun:test";
import { computeMailSignature, verifyMailSignature } from "./verify";

const SECRET = "test-mail-secret";
const BODY = JSON.stringify({ rcptTo: "mark@rox.one", messageId: "<m1>" });

async function headersFor(body: string, now: number) {
	return {
		signature: await computeMailSignature(SECRET, body),
		timestamp: String(now),
		nonce: "nonce-1",
	};
}

describe("verifyMailSignature", () => {
	test("accepts a correctly signed, fresh request", async () => {
		const now = Date.now();
		const res = await verifyMailSignature({
			secret: SECRET,
			body: BODY,
			headers: await headersFor(BODY, now),
			now,
		});
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.nonce).toBe("nonce-1");
	});

	test("rejects a tampered body (bad signature)", async () => {
		const now = Date.now();
		const headers = await headersFor(BODY, now);
		const res = await verifyMailSignature({
			secret: SECRET,
			body: `${BODY}tampered`,
			headers,
			now,
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects a wrong secret", async () => {
		const now = Date.now();
		const headers = {
			signature: await computeMailSignature("other-secret", BODY),
			timestamp: String(now),
			nonce: "nonce-1",
		};
		const res = await verifyMailSignature({
			secret: SECRET,
			body: BODY,
			headers,
			now,
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects a stale timestamp (replay window)", async () => {
		const now = Date.now();
		const headers = await headersFor(BODY, now - 10 * 60 * 1000);
		const res = await verifyMailSignature({
			secret: SECRET,
			body: BODY,
			headers,
			now,
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});

	test("rejects missing headers", async () => {
		const res = await verifyMailSignature({
			secret: SECRET,
			body: BODY,
			headers: { signature: null, timestamp: null, nonce: null },
		});
		expect(res).toMatchObject({ ok: false, reason: "missing_headers" });
	});
});
