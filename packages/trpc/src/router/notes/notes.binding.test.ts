import { describe, expect, mock, test } from "bun:test";

// N4 — disambiguate the two "notes" routers.
//
// The D7 Workspace-Suite surface (org + user-scoped, backed by
// `note_notebooks`/`note_notes`) is the canonical `notes` router. The legacy,
// unscoped per-profile notes router (backed by `profile_notes`) is the
// `profileNotes` surface. This test pins each router's procedure shape so the
// two can never be silently swapped again (the original footgun was D7 bound at
// `trpc.notebooks` while legacy occupied `trpc.notes`).

const fakeDb = new Proxy({}, { get: () => () => fakeDb }) as Record<
	string,
	unknown
>;
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));

const { notebooksRouter } = await import("../notebooks");
const { notesRouter } = await import("./notes");

describe("notes router binding (N4)", () => {
	test("D7 surface (canonical `notes`) exposes notebook + note CRUD", () => {
		const keys = Object.keys(notebooksRouter);
		for (const proc of [
			"listNotebooks",
			"createNotebook",
			"listNotes",
			"createNote",
			"getNote",
			"updateNote",
			"setPublished",
			"getPublic",
		]) {
			expect(keys).toContain(proc);
		}
	});

	test("legacy surface (`profileNotes`) is the unscoped per-profile router", () => {
		const keys = Object.keys(notesRouter);
		expect(keys.sort()).toEqual(
			["create", "listMine", "listPublic", "setPublished"].sort(),
		);
		// The legacy router must NOT carry the D7 notebook procedures.
		expect(keys).not.toContain("listNotebooks");
		expect(keys).not.toContain("getNote");
	});
});
