import { describe, expect, test } from "bun:test";

import {
	buildLiveTranscriptSegmentInsert,
	type LiveTranscriptChunkContext,
	normalizeSpeakerName,
	resolveTranscriptRoomOrg,
} from "./live-transcript";

const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

function ctx(
	p: Partial<LiveTranscriptChunkContext> = {},
): LiveTranscriptChunkContext {
	return {
		organizationId: ORG,
		createdBy: USER,
		roomName: `org:${ORG}:voice:thread-1`,
		speakerIdentity: "user-abc",
		speakerName: "Ада",
		capturedAt: 1_700_000_000_000,
		...p,
	};
}

describe("resolveTranscriptRoomOrg", () => {
	test("returns the org when the room name encodes the caller's active org", () => {
		expect(resolveTranscriptRoomOrg(`org:${ORG}:voice:t1`, ORG)).toBe(ORG);
	});

	test("rejects a cross-org room name (participant cannot write another org)", () => {
		const otherOrg = "99999999-9999-9999-9999-999999999999";
		expect(
			resolveTranscriptRoomOrg(`org:${otherOrg}:voice:t1`, ORG),
		).toBeNull();
	});

	test("rejects a malformed room name", () => {
		expect(resolveTranscriptRoomOrg("not-a-room", ORG)).toBeNull();
		expect(resolveTranscriptRoomOrg("org::voice:", ORG)).toBeNull();
	});
});

describe("normalizeSpeakerName", () => {
	test("trims a present name", () => {
		expect(normalizeSpeakerName("  Борис  ", "id-1")).toBe("Борис");
	});

	test("falls back to the identity when the name is blank", () => {
		expect(normalizeSpeakerName("   ", "id-1")).toBe("id-1");
		expect(normalizeSpeakerName("", "id-1")).toBe("id-1");
	});
});

describe("buildLiveTranscriptSegmentInsert", () => {
	test("maps a transcription + context into a persistable row", () => {
		const row = buildLiveTranscriptSegmentInsert("  привет мир  ", "ru", ctx());
		expect(row).not.toBeNull();
		expect(row).toMatchObject({
			organizationId: ORG,
			createdBy: USER,
			roomName: `org:${ORG}:voice:thread-1`,
			speakerIdentity: "user-abc",
			speakerName: "Ада",
			text: "привет мир", // trimmed
			language: "ru",
		});
		// capturedAt is converted to a Date for the timestamptz column.
		expect(row?.capturedAt).toBeInstanceOf(Date);
		expect((row?.capturedAt as Date).getTime()).toBe(1_700_000_000_000);
	});

	test("returns null for empty/whitespace text (silence is not persisted)", () => {
		expect(buildLiveTranscriptSegmentInsert("   ", "ru", ctx())).toBeNull();
		expect(buildLiveTranscriptSegmentInsert("", null, ctx())).toBeNull();
	});

	test("uses the identity as speaker name when name is blank", () => {
		const row = buildLiveTranscriptSegmentInsert(
			"привет",
			null,
			ctx({
				speakerName: "  ",
				speakerIdentity: "user-xyz",
			}),
		);
		expect(row?.speakerName).toBe("user-xyz");
		expect(row?.language).toBeNull();
	});
});
