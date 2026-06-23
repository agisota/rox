import { describe, expect, test } from "bun:test";
import { noteIdFromRoomId, noteRoomId } from "./types";

describe("noteIdFromRoomId", () => {
	test("parses the note id from a note room id", () => {
		expect(noteIdFromRoomId(noteRoomId("org1", "note1"))).toBe("note1");
	});
	test("returns null for a non-note room", () => {
		expect(noteIdFromRoomId("org:org1:dashboard:d1")).toBeNull();
	});
});
