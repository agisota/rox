import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { note: AnyRow | undefined; grant: AnyRow | undefined } = {
	note: undefined,
	grant: undefined,
};
const fakeDb = {
	query: {
		noteNotes: { findFirst: () => Promise.resolve(state.note) },
		accessGrants: { findFirst: () => Promise.resolve(state.grant) },
	},
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { assertNoteAccess } = await import("./assertNoteAccess");

const ORG = "22222222-2222-4222-8222-222222222222";
const OWNER = "owner-000-0000-4000-8000-000000000000";
const OTHER = "other-000-0000-4000-8000-000000000000";
const NOTE = "note0000-0000-4000-8000-000000000000";

beforeEach(() => {
	state.note = { id: NOTE, organizationId: ORG, ownerUserId: OWNER };
	state.grant = undefined;
});

describe("assertNoteAccess", () => {
	test("owner gets role=owner", async () => {
		const r = await assertNoteAccess(fakeDb as never, {
			noteId: NOTE,
			organizationId: ORG,
			userId: OWNER,
			min: "editor",
		});
		expect(r.role).toBe("owner");
	});

	test("same-org non-owner with NO grant is DENIED (DQ1)", async () => {
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE,
				organizationId: ORG,
				userId: OTHER,
				min: "viewer",
			}),
		).rejects.toThrow(/forbidden|access/i);
	});

	test("a user-grant editor passes the editor gate", async () => {
		state.grant = { role: "editor", granteeType: "user" };
		const r = await assertNoteAccess(fakeDb as never, {
			noteId: NOTE,
			organizationId: ORG,
			userId: OTHER,
			min: "editor",
		});
		expect(r.role).toBe("editor");
	});

	test("a user-grant VIEWER fails the editor gate", async () => {
		state.grant = { role: "viewer", granteeType: "user" };
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE,
				organizationId: ORG,
				userId: OTHER,
				min: "editor",
			}),
		).rejects.toThrow();
	});

	test("NOT_FOUND when the note is in another org", async () => {
		state.note = undefined; // findFirst scoped by (id, org) returns nothing
		await expect(
			assertNoteAccess(fakeDb as never, {
				noteId: NOTE,
				organizationId: ORG,
				userId: OWNER,
				min: "viewer",
			}),
		).rejects.toThrow(/not found|forbidden/i);
	});
});
