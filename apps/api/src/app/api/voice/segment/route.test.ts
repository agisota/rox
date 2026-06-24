import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { InsertLiveTranscriptSegment } from "@rox/db/schema";
import { computeSegmentSignature } from "@/lib/voice/verify";

// The persist seam pulls in `@rox/db/client`; stub it so the route test never
// touches a database. We capture the inserted row so we can assert the route maps
// the validated body → the correct `live_transcript_segments` shape (org derived
// from the room name, created_by = speakerIdentity). Mirrors how the mesh route
// test stubs `@/lib/mesh/drizzleDb`.
let lastInsert: InsertLiveTranscriptSegment | null = null;
let nextId = "row-1";
// Defense-in-depth membership gate: the fake echoes whatever the test arms here
// (default: the speaker IS an active member). We also record the (userId, org)
// the route checked, so a test can prove the gate ran with the right arguments.
let memberAllowed = true;
let lastMembershipCheck: { userId: string; organizationId: string } | null =
	null;
mock.module("@/lib/voice/persist", () => ({
	createSegmentIngestDb: () => ({
		isActiveOrgMember: async (userId: string, organizationId: string) => {
			lastMembershipCheck = { userId, organizationId };
			return memberAllowed;
		},
		insertSegment: async (row: InsertLiveTranscriptSegment) => {
			lastInsert = row;
			return { id: nextId };
		},
	}),
}));

const { POST } = await import("./route");

const SECRET = "route-test-transcript-secret";
// Real v4 UUIDs — Postgres `gen_random_uuid()` only ever emits RFC-4122 v4, which
// is what `z.string().uuid()` and the `users.id`/`created_by` FK require.
const ORG = "0a8f8c2e-1b3d-4e5f-8a9b-0c1d2e3f4a5b";
const USER = "1b9e7d3a-2c4f-4a6b-9c8d-0e1f2a3b4c5d";

function bodyFor(over: Record<string, unknown> = {}) {
	return JSON.stringify({
		roomName: `org:${ORG}:voice:c1`,
		segment: {
			id: "seg-1",
			speakerIdentity: USER,
			speakerName: "Ада",
			text: "привет мир",
			language: "ru",
			capturedAt: 1_700_000_000_000,
			...over,
		},
	});
}

async function signedRequest(
	body: string,
	over: { signature?: string; timestamp?: string; nonce?: string } = {},
) {
	const now = Date.now();
	const headers = new Headers({
		"content-type": "application/json",
		"x-rox-transcript-signature":
			over.signature ?? (await computeSegmentSignature(SECRET, body)),
		"x-rox-transcript-timestamp": over.timestamp ?? String(now),
		"x-rox-transcript-nonce": over.nonce ?? `nonce-${Math.random()}`,
	});
	return new Request("https://api.rox.one/api/voice/segment", {
		method: "POST",
		headers,
		body,
	});
}

beforeEach(() => {
	process.env.TRANSCRIBE_INGEST_SECRET = SECRET;
	lastInsert = null;
	nextId = "row-1";
	memberAllowed = true;
	lastMembershipCheck = null;
});

afterEach(() => {
	process.env.TRANSCRIBE_INGEST_SECRET = undefined;
});

describe("POST /api/voice/segment", () => {
	test("503 when the ingest secret is not configured (fails closed)", async () => {
		process.env.TRANSCRIBE_INGEST_SECRET = "";
		const res = await POST(await signedRequest(bodyFor()));
		expect(res.status).toBe(503);
	});

	test("200 inserts the segment and echoes the durable row id (active member)", async () => {
		nextId = "row-77";
		const res = await POST(await signedRequest(bodyFor()));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { accepted: boolean; id: string };
		expect(json.accepted).toBe(true);
		expect(json.id).toBe("row-77");
		// Defense-in-depth: the route gated on (speakerIdentity, org-from-room)
		// BEFORE persisting — the speaker was checked as a member of the derived org.
		expect(lastMembershipCheck).toEqual({ userId: USER, organizationId: ORG });
		// The route mapped the body → the persisted row: org derived from the room
		// name, created_by = the speaker's LiveKit identity (=== user id).
		expect(lastInsert).toMatchObject({
			organizationId: ORG,
			roomName: `org:${ORG}:voice:c1`,
			speakerIdentity: USER,
			speakerName: "Ада",
			text: "привет мир",
			language: "ru",
			createdBy: USER,
		});
		expect(lastInsert?.capturedAt).toBeInstanceOf(Date);
		expect((lastInsert?.capturedAt as Date).getTime()).toBe(1_700_000_000_000);
	});

	test("403 when the speaker is NOT an active member of the org (no insert)", async () => {
		// HMAC + body + nonce all valid, but the speaker's user id has no
		// membership in the room's org → defense-in-depth rejects, nothing persists.
		memberAllowed = false;
		const res = await POST(await signedRequest(bodyFor()));
		expect(res.status).toBe(403);
		// The gate was consulted with the speaker identity + org derived from the room.
		expect(lastMembershipCheck).toEqual({ userId: USER, organizationId: ORG });
		// Critically: NO row was written for the foreign speaker.
		expect(lastInsert).toBeNull();
	});

	test("falls back to the identity when the speaker name is blank", async () => {
		const res = await POST(
			await signedRequest(bodyFor({ speakerName: "   " })),
		);
		expect(res.status).toBe(200);
		expect(lastInsert?.speakerName).toBe(USER);
	});

	test("trims the persisted text", async () => {
		const res = await POST(
			await signedRequest(bodyFor({ text: "  привет  " })),
		);
		expect(res.status).toBe(200);
		expect(lastInsert?.text).toBe("привет");
	});

	test("401 on a bad signature", async () => {
		const body = bodyFor();
		const res = await POST(
			await signedRequest(body, { signature: "deadbeef" }),
		);
		expect(res.status).toBe(401);
		expect(lastInsert).toBeNull();
	});

	test("401 on missing auth headers", async () => {
		const req = new Request("https://api.rox.one/api/voice/segment", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: bodyFor(),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
		expect(lastInsert).toBeNull();
	});

	test("401 on a replayed nonce (same nonce twice)", async () => {
		const body = bodyFor();
		const nonce = `replay-${Math.random()}`;
		const first = await POST(await signedRequest(body, { nonce }));
		expect(first.status).toBe(200);
		const second = await POST(await signedRequest(body, { nonce }));
		expect(second.status).toBe(401);
	});

	test("401 on a stale timestamp (outside the skew window)", async () => {
		const body = bodyFor();
		const stale = String(Date.now() - 6 * 60 * 1000);
		const res = await POST(await signedRequest(body, { timestamp: stale }));
		expect(res.status).toBe(401);
		expect(lastInsert).toBeNull();
	});

	test("400 on a malformed JSON body (signature still valid over the bytes)", async () => {
		const raw = "{not json";
		const res = await POST(await signedRequest(raw));
		expect(res.status).toBe(400);
		expect(lastInsert).toBeNull();
	});

	test("400 on an invalid body (non-uuid speakerIdentity)", async () => {
		const res = await POST(
			await signedRequest(bodyFor({ speakerIdentity: "user-7" })),
		);
		expect(res.status).toBe(400);
		expect(lastInsert).toBeNull();
	});

	test("400 when the room name is not an org-scoped voice room", async () => {
		const body = JSON.stringify({
			roomName: "not-a-room",
			segment: {
				id: "seg-1",
				speakerIdentity: USER,
				speakerName: "Ада",
				text: "привет",
				language: "ru",
				capturedAt: 1_700_000_000_000,
			},
		});
		const res = await POST(await signedRequest(body));
		expect(res.status).toBe(400);
		expect(lastInsert).toBeNull();
	});

	test("400 when the segment text is empty/whitespace (silence not persisted)", async () => {
		const res = await POST(await signedRequest(bodyFor({ text: "   " })));
		expect(res.status).toBe(400);
		expect(lastInsert).toBeNull();
	});
});
