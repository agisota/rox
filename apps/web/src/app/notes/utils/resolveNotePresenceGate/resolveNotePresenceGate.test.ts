import { describe, expect, it } from "bun:test";

import { resolveNotePresenceGate } from "./resolveNotePresenceGate";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const NOTE = "00000000-0000-0000-0000-0000000000bb";

describe("resolveNotePresenceGate", () => {
	it("stays inert without a public key", () => {
		const gate = resolveNotePresenceGate({
			publicKey: undefined,
			organizationId: ORG,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("stays inert without an active org", () => {
		const gate = resolveNotePresenceGate({
			publicKey: "pk_test",
			organizationId: undefined,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(false);
	});

	it("stays inert without a selected note", () => {
		const gate = resolveNotePresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: null,
		});
		expect(gate.enabled).toBe(false);
	});

	it("stays inert when kill-switched even with keys + scope", () => {
		const gate = resolveNotePresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: NOTE,
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("opens with an org/note-scoped room id when configured", () => {
		const gate = resolveNotePresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			noteId: NOTE,
		});
		expect(gate.enabled).toBe(true);
		expect(gate.roomId).toBe(`org:${ORG}:note:${NOTE}`);
	});
});
