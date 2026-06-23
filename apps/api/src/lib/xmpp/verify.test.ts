import { describe, expect, test } from "bun:test";
import {
	computeXmppSignature,
	MAX_SKEW_MS,
	readXmppHeaders,
	verifyXmppSignature,
	XMPP_NONCE_HEADER,
	XMPP_SIGNATURE_HEADER,
	XMPP_TIMESTAMP_HEADER,
} from "./verify";

const SECRET = "xmpp-bridge-secret";
const BODY = JSON.stringify({ from: "bob@external.org", body: "hi" });

describe("readXmppHeaders", () => {
	test("reads the three namespaced headers", () => {
		const h = new Headers({
			[XMPP_SIGNATURE_HEADER]: "sig",
			[XMPP_TIMESTAMP_HEADER]: "123",
			[XMPP_NONCE_HEADER]: "n1",
		});
		expect(readXmppHeaders(h)).toEqual({
			signature: "sig",
			timestamp: "123",
			nonce: "n1",
		});
	});
});

describe("verifyXmppSignature", () => {
	test("accepts a valid signature within the skew window", async () => {
		const now = Date.now();
		const res = await verifyXmppSignature({
			secret: SECRET,
			body: BODY,
			now,
			headers: {
				signature: await computeXmppSignature(SECRET, BODY),
				timestamp: String(now),
				nonce: "nonce-1",
			},
		});
		expect(res).toEqual({ ok: true, nonce: "nonce-1" });
	});

	test("rejects missing headers", async () => {
		const res = await verifyXmppSignature({
			secret: SECRET,
			body: BODY,
			headers: { signature: null, timestamp: null, nonce: null },
		});
		expect(res).toEqual({ ok: false, reason: "missing_headers" });
	});

	test("rejects a bad signature", async () => {
		const now = Date.now();
		const res = await verifyXmppSignature({
			secret: SECRET,
			body: BODY,
			now,
			headers: { signature: "deadbeef", timestamp: String(now), nonce: "n" },
		});
		expect(res).toEqual({ ok: false, reason: "bad_signature" });
	});

	test("rejects a stale timestamp (replay window)", async () => {
		const now = Date.now();
		const stale = now - MAX_SKEW_MS - 1;
		const res = await verifyXmppSignature({
			secret: SECRET,
			body: BODY,
			now,
			headers: {
				signature: await computeXmppSignature(SECRET, BODY),
				timestamp: String(stale),
				nonce: "n",
			},
		});
		expect(res).toEqual({ ok: false, reason: "stale" });
	});

	test("a different secret produces a non-matching signature", async () => {
		const now = Date.now();
		const res = await verifyXmppSignature({
			secret: SECRET,
			body: BODY,
			now,
			headers: {
				signature: await computeXmppSignature("other-secret", BODY),
				timestamp: String(now),
				nonce: "n",
			},
		});
		expect(res).toEqual({ ok: false, reason: "bad_signature" });
	});
});
