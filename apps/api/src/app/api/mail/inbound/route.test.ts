import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { IngestResult } from "@/lib/mail/ingest";
import { computeMailSignature } from "@/lib/mail/verify";

// The ingest's Drizzle impl pulls in `@rox/db/client`; stub it so the route test
// never touches a database. The ingest function itself is stubbed to a queued
// result so we exercise the route's auth + status mapping in isolation.
mock.module("@/lib/mail/drizzleDb", () => ({
	createMailIngestDb: () => ({}),
}));

let nextResult: IngestResult = {
	kind: "accepted",
	messageId: "m1",
	threadId: "t1",
};
mock.module("@/lib/mail/ingest", () => ({
	ingestInboundMail: () => Promise.resolve(nextResult),
}));

const { POST } = await import("./route");

const SECRET = "route-test-secret";
const ENVELOPE = {
	rcptTo: "mark@rox.one",
	mailFrom: "alice@example.com",
	messageId: "<m1@example.com>",
	to: ["mark@rox.one"],
	rawSize: 100,
	rawBlobKey: "mail/raw/user-1/m1.eml",
	auth: { spf: true, dkim: true, dmarc: true },
};

async function signedRequest(
	body: string,
	over: { signature?: string; timestamp?: string; nonce?: string } = {},
) {
	const now = Date.now();
	const headers = new Headers({
		"content-type": "application/json",
		"x-rox-mail-signature":
			over.signature ?? (await computeMailSignature(SECRET, body)),
		"x-rox-mail-timestamp": over.timestamp ?? String(now),
		"x-rox-mail-nonce": over.nonce ?? `nonce-${Math.random()}`,
	});
	return new Request("https://api.rox.one/api/mail/inbound", {
		method: "POST",
		headers,
		body,
	});
}

beforeEach(() => {
	process.env.MAIL_INBOUND_SECRET = SECRET;
	nextResult = { kind: "accepted", messageId: "m1", threadId: "t1" };
});

afterEach(() => {
	process.env.MAIL_INBOUND_SECRET = undefined;
});

describe("POST /api/mail/inbound", () => {
	test("503 when the inbound secret is not configured", async () => {
		process.env.MAIL_INBOUND_SECRET = "";
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(503);
	});

	test("401 on a bad signature", async () => {
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(
			await signedRequest(body, { signature: "deadbeef" }),
		);
		expect(res.status).toBe(401);
	});

	test("401 on a replayed nonce", async () => {
		const body = JSON.stringify(ENVELOPE);
		const nonce = "fixed-nonce";
		const first = await POST(await signedRequest(body, { nonce }));
		expect(first.status).toBe(200);
		// Same nonce again (fresh signature/timestamp) → replay rejected.
		const second = await POST(await signedRequest(body, { nonce }));
		expect(second.status).toBe(401);
	});

	test("400 on a malformed envelope", async () => {
		const body = JSON.stringify({ not: "an envelope" });
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(400);
	});

	test("200 accepted for clean mail", async () => {
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { accepted: boolean };
		expect(json.accepted).toBe(true);
	});

	test("202 quarantined maps from the ingest result", async () => {
		nextResult = { kind: "quarantined", messageId: "m1", spamScore: 80 };
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(202);
	});

	test("409 duplicate maps from the ingest result", async () => {
		nextResult = { kind: "duplicate", messageId: "m1" };
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(409);
	});

	test("404 no-such-handle maps from the ingest result", async () => {
		nextResult = { kind: "no_such_handle" };
		const body = JSON.stringify(ENVELOPE);
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(404);
	});
});
