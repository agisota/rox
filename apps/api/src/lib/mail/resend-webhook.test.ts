import { describe, expect, test } from "bun:test";
import { computeSvixSignature, verifyResendWebhook } from "./resend-webhook";

// `whsec_` + base64("test-resend-secret-32-bytes!!!!"). Any valid base64 works.
const SECRET = `whsec_${btoa("test-resend-secret-32-bytes!!!!")}`;
const ID = "msg_2abc";
const BODY = JSON.stringify({
	type: "email.delivered",
	data: { email_id: "resend-evt-1" },
});

async function headersFor(body: string, nowSeconds: number) {
	const sig = await computeSvixSignature({
		secret: SECRET,
		id: ID,
		timestamp: String(nowSeconds),
		body,
	});
	return {
		id: ID,
		timestamp: String(nowSeconds),
		signature: `v1,${sig}`,
	};
}

describe("verifyResendWebhook", () => {
	test("accepts a correctly signed, fresh request and returns the svix id", async () => {
		const now = Date.now();
		const res = await verifyResendWebhook({
			secret: SECRET,
			body: BODY,
			headers: await headersFor(BODY, Math.floor(now / 1000)),
			now,
		});
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.id).toBe(ID);
	});

	test("accepts when one of several space-separated signatures matches", async () => {
		const now = Date.now();
		const good = await headersFor(BODY, Math.floor(now / 1000));
		const res = await verifyResendWebhook({
			secret: SECRET,
			body: BODY,
			headers: { ...good, signature: `v1,bogus ${good.signature}` },
			now,
		});
		expect(res.ok).toBe(true);
	});

	test("rejects a tampered body", async () => {
		const now = Date.now();
		const headers = await headersFor(BODY, Math.floor(now / 1000));
		const res = await verifyResendWebhook({
			secret: SECRET,
			body: `${BODY}tampered`,
			headers,
			now,
		});
		expect(res).toMatchObject({ ok: false, reason: "bad_signature" });
	});

	test("rejects a stale timestamp", async () => {
		const now = Date.now();
		const oldSeconds = Math.floor((now - 10 * 60 * 1000) / 1000);
		const res = await verifyResendWebhook({
			secret: SECRET,
			body: BODY,
			headers: await headersFor(BODY, oldSeconds),
			now,
		});
		expect(res).toMatchObject({ ok: false, reason: "stale" });
	});

	test("rejects missing headers", async () => {
		const res = await verifyResendWebhook({
			secret: SECRET,
			body: BODY,
			headers: { id: null, timestamp: null, signature: null },
			now: Date.now(),
		});
		expect(res).toMatchObject({ ok: false, reason: "missing_headers" });
	});
});
