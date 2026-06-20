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
} = {
	selectRows: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	deleteCalls: 0,
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
	insert: () => ({
		values: (vals: AnyRow) => {
			state.inserted.push(vals);
			return { returning: () => Promise.resolve(state.insertReturning) };
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
	delete: () => ({
		where: () => {
			state.deleteCalls += 1;
			return Promise.resolve();
		},
	}),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { notebooksRouter } = await import("./notebooks");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

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

beforeEach(() => {
	state.selectRows = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.deleteCalls = 0;
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
		state.insertReturning = [{ id: "note-new" }];
		const caller = callerFor("org-1");
		const res = await caller.notebooks.createNote({
			notebookId: NOTEBOOK_ID,
			title: "Заметка",
			markdown: "# hi",
			tags: ["a"],
		});
		expect(res?.id).toBe("note-new");
		expect(state.inserted[0]?.organizationId).toBe("org-1");
		expect(state.inserted[0]?.ownerUserId).toBe("user-1");
		// FK resolved from the verified parent notebook, not raw input.
		expect(state.inserted[0]?.notebookId).toBe("nb-1");
		expect(state.inserted[0]?.title).toBe("Заметка");
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
		expect(res.url).toContain("/s/public-slug");
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
});
