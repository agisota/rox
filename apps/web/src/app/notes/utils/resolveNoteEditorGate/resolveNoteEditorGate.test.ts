import { describe, expect, it } from "bun:test";

import { resolveNoteEditorGate } from "./resolveNoteEditorGate";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const NOTE = "00000000-0000-0000-0000-0000000000bb";

/**
 * The co-editing gate must keep the editor SINGLE-PLAYER unless the live
 * Liveblocks configuration that presence already uses is present. It reuses the
 * `collaboration.editor` experimental feature (flipped `ready` this wave) and
 * the org/note room id — so when it opens, it opens onto the SAME room as
 * `resolveNotePresenceGate`.
 */
describe("resolveNoteEditorGate", () => {
	it("stays single-player without a public key", () => {
		const gate = resolveNoteEditorGate({
			publicKey: undefined,
			organizationId: ORG,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("stays single-player without an active org", () => {
		const gate = resolveNoteEditorGate({
			publicKey: "pk_test",
			organizationId: undefined,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("stays single-player without a selected note", () => {
		const gate = resolveNoteEditorGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: null,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("stays single-player when kill-switched even with keys + scope", () => {
		const gate = resolveNoteEditorGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: NOTE,
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("opens the collaborative path onto the SAME note room when configured", () => {
		const gate = resolveNoteEditorGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(true);
		// Identical room-id shape to resolveNotePresenceGate — co-editing rides
		// the room presence already opened, never a second room.
		expect(gate.roomId).toBe(`org:${ORG}:note:${NOTE}`);
	});
});
