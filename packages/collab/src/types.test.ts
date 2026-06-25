import { describe, expect, test } from "bun:test";
import { deriveRoomVisibility, noteIdFromRoomId, noteRoomId } from "./types";

describe("noteIdFromRoomId", () => {
	test("parses the note id from a note room id", () => {
		expect(noteIdFromRoomId(noteRoomId("org1", "note1"))).toBe("note1");
	});
	test("returns null for a non-note room", () => {
		expect(noteIdFromRoomId("org:org1:dashboard:d1")).toBeNull();
	});
});

describe("deriveRoomVisibility", () => {
	test("solo room (no other peers) is private", () => {
		expect(deriveRoomVisibility({ otherMemberCount: 0 })).toBe("private");
	});
	test("a present peer makes the room shared", () => {
		expect(deriveRoomVisibility({ otherMemberCount: 1 })).toBe("shared");
		expect(deriveRoomVisibility({ otherMemberCount: 3 })).toBe("shared");
	});
	test("an explicit share flag forces shared even with no live peers", () => {
		expect(
			deriveRoomVisibility({ otherMemberCount: 0, explicitlyShared: true }),
		).toBe("shared");
	});
	test("explicitlyShared=false defers to the live member count", () => {
		expect(
			deriveRoomVisibility({ otherMemberCount: 0, explicitlyShared: false }),
		).toBe("private");
		expect(
			deriveRoomVisibility({ otherMemberCount: 2, explicitlyShared: false }),
		).toBe("shared");
	});
});
