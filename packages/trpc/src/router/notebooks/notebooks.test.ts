import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free harness in dashboard.test.ts).

type AnyRow = Record<string, unknown>;

const state: {
	selectRows: AnyRow[];
	inserted: AnyRow[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
	deleteCalls: number;
	// Per-table insert capture so doc-backed writes can be asserted (N2).
	insertedByTable: Record<string, AnyRow[]>;
	deletedTables: string[];
	tableNameFor: (target: unknown) => string;
} = {
	selectRows: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	deleteCalls: 0,
	insertedByTable: {},
	deletedTables: [],
	tableNameFor: () => "unknown",
};

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.orderBy = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.limit = step;
		return p;
	};
	return step();
}

const fakeDb = {
	select: () => selectBuilder(state.selectRows),
	insert: (table: unknown) => ({
		values: (vals: AnyRow) => {
			state.inserted.push(vals);
			const name = state.tableNameFor(table);
			const bucket = state.insertedByTable[name] ?? [];
			bucket.push(vals);
			state.insertedByTable[name] = bucket;
			// `.values()` is itself awaitable (no-returning inserts) and also exposes
			// `.returning()`; both resolve the configured rows. `.onConflictDoNothing()`
			// (G — idempotent edge insert) returns the same awaitable so re-adding an
			// existing edge resolves instead of throwing (mirrors mesh.test.ts).
			const p = Promise.resolve(state.insertReturning) as Promise<AnyRow[]> & {
				returning: () => Promise<AnyRow[]>;
				onConflictDoNothing: () => typeof p;
			};
			p.returning = () => Promise.resolve(state.insertReturning);
			p.onConflictDoNothing = () => p;
			return p;
		},
	}),
	update: () => ({
		set: (vals: AnyRow) => {
			state.updated.push(vals);
			return {
				where: () => ({
					returning: () => Promise.resolve(state.insertReturning),
				}),
			};
		},
	}),
	delete: (table: unknown) => ({
		where: () => {
			state.deleteCalls += 1;
			state.deletedTables.push(state.tableNameFor(table));
			return Promise.resolve();
		},
	}),
	// dbWs.transaction(cb) — run the callback with the same fake handle so the
	// router's atomic create/update/delete paths exercise the real insert/update
	// builders above.
	transaction: <T>(cb: (tx: typeof fakeDb) => Promise<T>) => cb(fakeDb),
};

// Resolve a drizzle table object back to its SQL name for per-table assertions.
function tableName(table: unknown): string {
	if (table && typeof table === "object") {
		for (const sym of Object.getOwnPropertySymbols(table)) {
			const desc = sym.description ?? "";
			if (desc.includes("Name")) {
				const v = (table as Record<symbol, unknown>)[sym];
				if (typeof v === "string") return v;
			}
		}
	}
	return "unknown";
}

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { notebooksRouter } = await import("./notebooks");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");
const schema = await import("@rox/db/schema");

state.tableNameFor = (target: unknown) => {
	if (target === schema.knowledgeDocuments) return "knowledge_documents";
	if (target === schema.knowledgeLinks) return "knowledge_links";
	if (target === schema.noteNotes) return "note_notes";
	if (target === schema.noteNotebooks) return "note_notebooks";
	if (target === schema.noteBookItems) return "note_book_items";
	return tableName(target);
};

const appRouter = createTRPCRouter({ notebooks: notebooksRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(activeOrganizationId: string | null) {
	return createCaller({
		session: {
			user: { id: "user-1", email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

const NOTEBOOK_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const DOC_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID_2 = "44444444-4444-4444-8444-444444444444";
const DOC_ID_3 = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
	state.selectRows = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.deleteCalls = 0;
	state.insertedByTable = {};
	state.deletedTables = [];
	fakeDb.select = () => selectBuilder(state.selectRows);
});

describe("notebooks.listNotebooks", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.notebooks.listNotebooks()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns the caller's notebooks", async () => {
		state.selectRows = [{ id: "nb-1", name: "Личное" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.listNotebooks();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe("nb-1");
	});
});

describe("notebooks.createNotebook", () => {
	test("scopes the notebook to the org + caller", async () => {
		state.insertReturning = [{ id: "nb-new" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.createNotebook({ name: "Идеи" });
		expect(res?.id).toBe("nb-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.ownerUserId).toBe("user-1");
		expect(state.inserted[0]?.name).toBe("Идеи");
	});

	test("rejects an empty name", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.createNotebook({ name: "   " }),
		).rejects.toThrow();
	});
});

describe("notebooks.createNote", () => {
	test("denormalizes org + owner from the parent notebook", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		state.insertReturning = [{ id: "note-new", knowledgeDocumentId: "doc-1" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.createNote({
			notebookId: NOTEBOOK_ID,
			title: "Заметка",
			markdown: "# hi",
			tags: ["a"],
		});
		expect(res?.id).toBe("note-new");
		const noteRow = state.insertedByTable.note_notes?.[0];
		expect(noteRow?.organizationId).toBe("org-1");
		expect(noteRow?.ownerUserId).toBe("user-1");
		// FK resolved from the verified parent notebook, not raw input.
		expect(noteRow?.notebookId).toBe("nb-1");
		expect(noteRow?.title).toBe("Заметка");
	});

	test("N2: backs the note with a knowledge_documents (type=note) row + edge", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		// The fake returns this for every insert, so the backing doc's id is "doc-1".
		state.insertReturning = [{ id: "doc-1" }];
		const caller = callerFor("org-1");
		await caller.notebooks.createNote({
			notebookId: NOTEBOOK_ID,
			title: "Заметка",
			markdown: "# hi",
			tags: ["a"],
		});
		// A backing knowledge document is created with type='note'.
		const doc = state.insertedByTable.knowledge_documents?.[0];
		expect(doc?.type).toBe("note");
		expect(doc?.title).toBe("Заметка");
		expect(doc?.markdown).toBe("# hi");
		expect(doc?.organizationId).toBe("org-1");
		// The note index row links to the backing doc id returned by its insert.
		const noteRow = state.insertedByTable.note_notes?.[0];
		expect(noteRow?.knowledgeDocumentId).toBe("doc-1");
		// A note_book_items membership edge is wired to the backing doc.
		const edge = state.insertedByTable.note_book_items?.[0];
		expect(edge?.noteBookId).toBe("nb-1");
		expect(edge?.organizationId).toBe("org-1");
		expect(edge?.documentId).toBe("doc-1");
	});

	test("404s when the notebook is not the caller's", async () => {
		state.selectRows = [];
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.createNote({ notebookId: NOTEBOOK_ID, title: "x" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("notebooks.listNotes", () => {
	test("filters notes by tag in-memory (requires ALL tags)", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "n1", tags: ["work", "idea"] },
				{ id: "n2", tags: ["work"] },
				{ id: "n3", tags: [] },
			]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.listNotes({ tags: ["work", "idea"] });
		expect(res.map((n) => n.id)).toEqual(["n1"]);
	});

	test("returns all notes when no tag filter is given", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "n1", tags: [] },
				{ id: "n2", tags: ["x"] },
			]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.listNotes({});
		expect(res).toHaveLength(2);
	});

	test("FIX 1: overlays fresh title/tags from the backing doc (mirror is stale)", async () => {
		// A knowledge.update edited the backing doc's title/tags directly, leaving
		// the note_notes mirror stale. listNotes must reflect the DOC's values.
		let call = 0;
		fakeDb.select = () => {
			call += 1;
			// 1st select: note_notes index rows (stale mirror); 2nd select: the
			// batched knowledge_documents fetch keyed by knowledge_document_id.
			return call === 1
				? selectBuilder([
						{
							id: "n1",
							title: "Stale Title",
							tags: ["old"],
							knowledgeDocumentId: "doc-1",
						},
						// A legacy/detached note (null doc id) keeps its inline mirror.
						{
							id: "n2",
							title: "Legacy",
							tags: ["keep"],
							knowledgeDocumentId: null,
						},
					])
				: selectBuilder([{ id: "doc-1", title: "Fresh Title", tags: ["new"] }]);
		};
		const caller = callerFor("org-1");
		const res = await caller.notebooks.listNotes({});
		const n1 = res.find((n) => n.id === "n1");
		const n2 = res.find((n) => n.id === "n2");
		// Doc-backed note shows the doc's fresh title/tags, not the stale mirror.
		expect(n1?.title).toBe("Fresh Title");
		expect(n1?.tags).toEqual(["new"]);
		// markdown is NEVER selected/returned by the list path (stays lightweight).
		expect("markdown" in (n1 ?? {})).toBe(false);
		// Detached/legacy note falls back to its inline mirror.
		expect(n2?.title).toBe("Legacy");
		expect(n2?.tags).toEqual(["keep"]);
	});

	test("FIX 1: tag filter matches the RESOLVED (doc) tags, not the stale mirror", async () => {
		let call = 0;
		fakeDb.select = () => {
			call += 1;
			return call === 1
				? selectBuilder([
						// Mirror tags are stale ["old"]; the doc now has ["work"].
						{
							id: "n1",
							title: "t",
							tags: ["old"],
							knowledgeDocumentId: "doc-1",
						},
					])
				: selectBuilder([{ id: "doc-1", title: "t", tags: ["work"] }]);
		};
		const caller = callerFor("org-1");
		// Filtering by the doc's current tag returns the note; the stale mirror tag
		// would have excluded it.
		const res = await caller.notebooks.listNotes({ tags: ["work"] });
		expect(res.map((n) => n.id)).toEqual(["n1"]);
	});
});

describe("notebooks.getNote", () => {
	test("returns the note with a null publicUrl when unpublished", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "note-1", organizationId: "org-1", publicSlug: null },
			]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.getNote({ noteId: NOTE_ID });
		expect(res.id).toBe("note-1");
		expect(res.publicUrl).toBeNull();
	});
});

describe("notebooks MDX safety (N5)", () => {
	test("createNote rejects unsafe MDX with BAD_REQUEST", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.createNote({
				notebookId: NOTEBOOK_ID,
				title: "x",
				markdown: "<script>alert(1)</script>",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		// Nothing should have been inserted when the guard rejects.
		expect(state.inserted).toHaveLength(0);
	});

	test("createNote allows whitelisted markdown", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		state.insertReturning = [{ id: "note-ok" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.createNote({
			notebookId: NOTEBOOK_ID,
			title: "ok",
			markdown: "# Title\n\nplain text",
		});
		expect(res?.id).toBe("note-ok");
	});

	test("updateNote rejects unsafe MDX with BAD_REQUEST", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "note-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.updateNote({
				noteId: NOTE_ID,
				markdown: "import x from 'fs'",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.updated).toHaveLength(0);
	});

	test("setPublished rejects publishing a note whose body is unsafe", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{
					id: "note-1",
					organizationId: "org-1",
					ownerUserId: "user-1",
					publicSlug: null,
					markdown: "<EvilWidget />",
				},
			]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.setPublished({ noteId: NOTE_ID, isPublished: true }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		// Must not flip the publish flag when the body is rejected.
		expect(state.updated).toHaveLength(0);
	});

	test("setPublished allows unpublishing even if body is unsafe", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{
					id: "note-1",
					organizationId: "org-1",
					ownerUserId: "user-1",
					publicSlug: "keepme01",
					markdown: "<EvilWidget />",
				},
			]);
		state.insertReturning = [{ id: "note-1", publicSlug: "keepme01" }];
		const caller = callerFor("org-1");
		await caller.notebooks.setPublished({
			noteId: NOTE_ID,
			isPublished: false,
		});
		expect(state.updated[0]?.isPublished).toBe(false);
	});
});

describe("notebooks.setPublished", () => {
	test("mints a public slug + url on first publish", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "note-1", organizationId: "org-1", publicSlug: null },
			]);
		state.insertReturning = [{ id: "note-1", publicSlug: "abc12345" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.setPublished({
			noteId: NOTE_ID,
			isPublished: true,
		});
		expect(state.updated[0]?.isPublished).toBe(true);
		expect(typeof state.updated[0]?.publicSlug).toBe("string");
		expect(res.publicUrl).toContain("/s/");
	});

	test("keeps the existing slug when unpublishing", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "note-1", organizationId: "org-1", publicSlug: "keepme01" },
			]);
		state.insertReturning = [{ id: "note-1", publicSlug: "keepme01" }];
		const caller = callerFor("org-1");
		await caller.notebooks.setPublished({
			noteId: NOTE_ID,
			isPublished: false,
		});
		expect(state.updated[0]?.isPublished).toBe(false);
		expect(state.updated[0]?.publicSlug).toBe("keepme01");
	});
});

describe("notebooks.getPublic", () => {
	test("404s when no published note matches the slug", async () => {
		state.selectRows = [];
		const res = notebooksRouter.getPublic;
		expect(res).toBeDefined();
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.getPublic({ slug: "missing-slug" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns presentation fields + url for a published note", async () => {
		fakeDb.select = () =>
			selectBuilder([{ id: "note-1", title: "Public", markdown: "# hi" }]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.getPublic({ slug: "public-slug" });
		expect(res.title).toBe("Public");
		expect(res.url).toContain("/s/note/public-slug");
	});
});

describe("notebooks.deleteNote", () => {
	test("deletes after confirming ownership", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "note-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.deleteNote({ noteId: NOTE_ID });
		expect(res.ok).toBe(true);
		expect(state.deleteCalls).toBe(1);
	});

	test("N2: also deletes the backing knowledge document (cascade removes edge)", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{
					id: "note-1",
					organizationId: "org-1",
					ownerUserId: "user-1",
					knowledgeDocumentId: "doc-1",
				},
			]);
		const caller = callerFor("org-1");
		await caller.notebooks.deleteNote({ noteId: NOTE_ID });
		// Both the index row and the backing doc are deleted.
		expect(state.deletedTables).toContain("note_notes");
		expect(state.deletedTables).toContain("knowledge_documents");
	});
});

describe("notebooks.updateNote (N2 doc-backed)", () => {
	test("writes content to the backing knowledge document", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{
					id: "note-1",
					organizationId: "org-1",
					ownerUserId: "user-1",
					knowledgeDocumentId: "doc-1",
				},
			]);
		state.insertReturning = [{ id: "note-1" }];
		const caller = callerFor("org-1");
		await caller.notebooks.updateNote({
			noteId: NOTE_ID,
			title: "Renamed",
			markdown: "updated body",
		});
		// The doc update + the index mirror update both ran.
		const docUpdate = state.updated.find((u) => u.markdown === "updated body");
		expect(docUpdate).toBeDefined();
		expect(state.updated.some((u) => u.title === "Renamed")).toBe(true);
	});

	test("syncs backlinks via knowledge_links when markdown changes", async () => {
		// The note + the wikilink-target resolution both read selectRows; an empty
		// target set means syncOutgoingLinks only deletes stale links (no insert).
		fakeDb.select = () =>
			selectBuilder([
				{
					id: "note-1",
					organizationId: "org-1",
					ownerUserId: "user-1",
					knowledgeDocumentId: "doc-1",
				},
			]);
		state.insertReturning = [{ id: "note-1", markdown: "see [[other-note]]" }];
		const caller = callerFor("org-1");
		await caller.notebooks.updateNote({
			noteId: NOTE_ID,
			markdown: "see [[other-note]]",
		});
		// Backlink materialization deletes existing knowledge_links for the source.
		expect(state.deletedTables).toContain("knowledge_links");
		// And inserts the resolved/unresolved edge.
		expect(state.insertedByTable.knowledge_links?.length ?? 0).toBeGreaterThan(
			0,
		);
	});
});

describe("notebooks.getNote (N2 doc-backed)", () => {
	test("resolves content from the backing knowledge document", async () => {
		let call = 0;
		fakeDb.select = () => {
			call += 1;
			// 1st select: the note index row; 2nd select: the backing doc content.
			return call === 1
				? selectBuilder([
						{
							id: "note-1",
							organizationId: "org-1",
							ownerUserId: "user-1",
							knowledgeDocumentId: "doc-1",
							title: "stale mirror",
							markdown: "stale",
							tags: [],
							publicSlug: null,
						},
					])
				: selectBuilder([
						{ title: "Fresh Doc", markdown: "fresh body", tags: ["x"] },
					]);
		};
		const caller = callerFor("org-1");
		const res = await caller.notebooks.getNote({ noteId: NOTE_ID });
		// Authoritative content comes from the doc, not the index mirror.
		expect(res.title).toBe("Fresh Doc");
		expect(res.markdown).toBe("fresh body");
		expect(res.tags).toEqual(["x"]);
	});
});

// --- notebook membership (G): add / remove / reorder -------------------------

describe("notebooks.addNoteToNotebook", () => {
	// select #1 = getNotebookForUser, #2 = assertDocInOrg, #3 = max(sortOrder).
	function stubAddSelects(opts: {
		notebook?: AnyRow | null;
		doc?: AnyRow | null;
		maxRow?: AnyRow | null;
	}) {
		let call = 0;
		fakeDb.select = () => {
			call += 1;
			if (call === 1) {
				return selectBuilder(
					opts.notebook === null
						? []
						: [
								opts.notebook ?? {
									id: "nb-1",
									organizationId: "org-1",
									ownerUserId: "user-1",
								},
							],
				);
			}
			if (call === 2) {
				return selectBuilder(
					opts.doc === null
						? []
						: [opts.doc ?? { id: DOC_ID, organizationId: "org-1" }],
				);
			}
			return selectBuilder(opts.maxRow == null ? [] : [opts.maxRow]);
		};
	}

	test("inserts an org/owner-scoped edge appended after the max sortOrder", async () => {
		stubAddSelects({ maxRow: { max: 4 } });
		const caller = callerFor("org-1");
		const res = await caller.notebooks.addNoteToNotebook({
			noteBookId: NOTEBOOK_ID,
			documentId: DOC_ID,
		});
		expect(res).toEqual({ ok: true });
		const edge = state.insertedByTable.note_book_items?.[0];
		expect(edge?.noteBookId).toBe("nb-1");
		expect(edge?.organizationId).toBe("org-1");
		expect(edge?.documentId).toBe(DOC_ID);
		expect(edge?.addedBy).toBe("user-1");
		// Appended at max(sortOrder) + 1.
		expect(edge?.sortOrder).toBe(5);
	});

	test("appends at sortOrder 0 for an empty notebook", async () => {
		stubAddSelects({ maxRow: null });
		const caller = callerFor("org-1");
		await caller.notebooks.addNoteToNotebook({
			noteBookId: NOTEBOOK_ID,
			documentId: DOC_ID,
		});
		const edge = state.insertedByTable.note_book_items?.[0];
		expect(edge?.sortOrder).toBe(0);
	});

	test("is idempotent: re-adding an existing edge resolves to { ok: true }", async () => {
		// onConflictDoNothing makes the duplicate insert a no-op rather than a throw.
		stubAddSelects({ maxRow: { max: 0 } });
		const caller = callerFor("org-1");
		const res = await caller.notebooks.addNoteToNotebook({
			noteBookId: NOTEBOOK_ID,
			documentId: DOC_ID,
		});
		expect(res).toEqual({ ok: true });
	});

	test("FORBIDDEN without an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.notebooks.addNoteToNotebook({
				noteBookId: NOTEBOOK_ID,
				documentId: DOC_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("NOT_FOUND when the notebook is not the caller's", async () => {
		stubAddSelects({ notebook: null });
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.addNoteToNotebook({
				noteBookId: NOTEBOOK_ID,
				documentId: DOC_ID,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.insertedByTable.note_book_items).toBeUndefined();
	});

	test("NOT_FOUND when the document belongs to another org", async () => {
		stubAddSelects({ doc: null });
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.addNoteToNotebook({
				noteBookId: NOTEBOOK_ID,
				documentId: DOC_ID,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.insertedByTable.note_book_items).toBeUndefined();
	});
});

describe("notebooks.removeNoteFromNotebook", () => {
	test("deletes ONLY the note_book_items edge (note/doc untouched)", async () => {
		fakeDb.select = () =>
			selectBuilder([
				{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
			]);
		const caller = callerFor("org-1");
		const res = await caller.notebooks.removeNoteFromNotebook({
			noteBookId: NOTEBOOK_ID,
			documentId: DOC_ID,
		});
		expect(res).toEqual({ ok: true });
		expect(state.deletedTables).toContain("note_book_items");
		expect(state.deletedTables).not.toContain("note_notes");
		expect(state.deletedTables).not.toContain("knowledge_documents");
	});

	test("FORBIDDEN without an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.notebooks.removeNoteFromNotebook({
				noteBookId: NOTEBOOK_ID,
				documentId: DOC_ID,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(state.deleteCalls).toBe(0);
	});

	test("NOT_FOUND when the notebook is not the caller's", async () => {
		fakeDb.select = () => selectBuilder([]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.removeNoteFromNotebook({
				noteBookId: NOTEBOOK_ID,
				documentId: DOC_ID,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.deleteCalls).toBe(0);
	});
});

describe("notebooks.reorderNotebookItems", () => {
	// select #1 = getNotebookForUser, #2 = existing edge documentIds.
	function stubReorderSelects(existingDocIds: string[]) {
		let call = 0;
		fakeDb.select = () => {
			call += 1;
			return call === 1
				? selectBuilder([
						{ id: "nb-1", organizationId: "org-1", ownerUserId: "user-1" },
					])
				: selectBuilder(existingDocIds.map((documentId) => ({ documentId })));
		};
	}

	test("persists sortOrder per index in the given order", async () => {
		stubReorderSelects([DOC_ID, DOC_ID_2, DOC_ID_3]);
		const caller = callerFor("org-1");
		// New order: d3, d1, d2 -> sortOrder 0, 1, 2 respectively.
		const res = await caller.notebooks.reorderNotebookItems({
			noteBookId: NOTEBOOK_ID,
			orderedDocumentIds: [DOC_ID_3, DOC_ID, DOC_ID_2],
		});
		expect(res).toEqual({ ok: true });
		// The proc iterates orderedDocumentIds in order, so the Nth update sets
		// sortOrder N for the Nth document id.
		expect(state.updated).toHaveLength(3);
		expect(state.updated[0]?.sortOrder).toBe(0); // d3
		expect(state.updated[1]?.sortOrder).toBe(1); // d1
		expect(state.updated[2]?.sortOrder).toBe(2); // d2
	});

	test("BAD_REQUEST when an id is not an edge of the notebook (no writes)", async () => {
		stubReorderSelects([DOC_ID, DOC_ID_2]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.reorderNotebookItems({
				noteBookId: NOTEBOOK_ID,
				orderedDocumentIds: [DOC_ID, DOC_ID_2, DOC_ID_3],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.updated).toHaveLength(0);
	});

	test("BAD_REQUEST when ids are a partial subset of the notebook's edges", async () => {
		stubReorderSelects([DOC_ID, DOC_ID_2, DOC_ID_3]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.reorderNotebookItems({
				noteBookId: NOTEBOOK_ID,
				orderedDocumentIds: [DOC_ID, DOC_ID_2],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.updated).toHaveLength(0);
	});

	test("BAD_REQUEST on duplicate ids in the input (no writes)", async () => {
		stubReorderSelects([DOC_ID, DOC_ID_2]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.reorderNotebookItems({
				noteBookId: NOTEBOOK_ID,
				orderedDocumentIds: [DOC_ID, DOC_ID],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.updated).toHaveLength(0);
	});

	test("FORBIDDEN without an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.notebooks.reorderNotebookItems({
				noteBookId: NOTEBOOK_ID,
				orderedDocumentIds: [DOC_ID],
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("NOT_FOUND when the notebook is not the caller's", async () => {
		fakeDb.select = () => selectBuilder([]);
		const caller = callerFor("org-1");
		await expect(
			caller.notebooks.reorderNotebookItems({
				noteBookId: NOTEBOOK_ID,
				orderedDocumentIds: [DOC_ID],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(state.updated).toHaveLength(0);
	});
});
