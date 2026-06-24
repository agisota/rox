import { describe, expect, test } from "bun:test";
import { parseSegmentIngestBody } from "./parse";

// A real v4 UUID — `z.string().uuid()` (and the `created_by` FK) require RFC-4122
// v4, which is the only thing Postgres `gen_random_uuid()` ever produces.
const USER = "1b9e7d3a-2c4f-4a6b-9c8d-0e1f2a3b4c5d";

function validBody(over: Record<string, unknown> = {}) {
	return {
		roomName: `org:11111111-1111-1111-1111-111111111111:voice:c1`,
		segment: {
			id: "seg-1",
			speakerIdentity: USER,
			speakerName: "Ада",
			text: "привет мир",
			language: "ru",
			capturedAt: 1_700_000_000_000,
			...over,
		},
	};
}

describe("parseSegmentIngestBody", () => {
	test("accepts a well-formed worker payload", () => {
		const res = parseSegmentIngestBody(validBody());
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.body.roomName).toContain(":voice:");
			expect(res.body.segment.speakerIdentity).toBe(USER);
			expect(res.body.segment.language).toBe("ru");
		}
	});

	test("accepts a null language (Deepgram returned no language)", () => {
		const res = parseSegmentIngestBody(validBody({ language: null }));
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.body.segment.language).toBeNull();
	});

	test("rejects a non-object body", () => {
		expect(parseSegmentIngestBody(null).ok).toBe(false);
		expect(parseSegmentIngestBody("nope").ok).toBe(false);
		expect(parseSegmentIngestBody(42).ok).toBe(false);
	});

	test("rejects a missing roomName", () => {
		const body = validBody();
		// @ts-expect-error — deliberately drop a required field
		body.roomName = undefined;
		const res = parseSegmentIngestBody(body);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("roomName");
	});

	test("rejects an empty roomName", () => {
		const res = parseSegmentIngestBody(validBody({}));
		// sanity: the valid body passes, then assert the empty case
		expect(res.ok).toBe(true);
		const bad = parseSegmentIngestBody({ ...validBody(), roomName: "" });
		expect(bad.ok).toBe(false);
	});

	test("rejects a missing segment", () => {
		const res = parseSegmentIngestBody({
			roomName: "org:o1:voice:c1",
		});
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("segment");
	});

	test("rejects a non-uuid speakerIdentity (must be a real user id)", () => {
		const res = parseSegmentIngestBody(
			validBody({ speakerIdentity: "user-7" }),
		);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("speakerIdentity");
	});

	test("rejects a missing segment.id", () => {
		const body = validBody();
		// @ts-expect-error — deliberately drop a required field
		body.segment.id = undefined;
		const res = parseSegmentIngestBody(body);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("id");
	});

	test("rejects a non-string text", () => {
		const res = parseSegmentIngestBody(validBody({ text: 123 }));
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("text");
	});

	test("rejects a non-finite capturedAt", () => {
		const res = parseSegmentIngestBody(validBody({ capturedAt: "soon" }));
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("capturedAt");
	});
});
