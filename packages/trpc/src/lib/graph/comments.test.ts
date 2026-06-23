import { describe, expect, test } from "bun:test";
import { createComment, listComments } from "./comments";
import type { GraphDb, GraphTx } from "./types";

type AnyRow = Record<string, unknown>;

/**
 * Minimal chainable Drizzle-like handle stub for the comments lib. Each call to
 * `.select(...)` drains the next queued result-set (FIFO); `.insert(...)` records
 * the inserted values into a sink and returns a configured row. The query
 * terminators (`where`/`limit`/`orderBy`/`returning`/`onConflictDoNothing`) are
 * thenable so `await` resolves the queued rows — mirrors
 * `graph-service.link.test.ts`.
 */
function makeHandle(options: {
	selectResults: AnyRow[][];
	insertReturning: AnyRow[][];
	insertedSink: Array<{ table: "thread" | "comment"; values: AnyRow }>;
}) {
	let selectCall = 0;
	let insertCall = 0;

	const selectBuilder = () => {
		const rows = options.selectResults[selectCall] ?? [];
		selectCall += 1;
		const make = (): Promise<AnyRow[]> & Record<string, unknown> => {
			const p = Promise.resolve(rows) as Promise<AnyRow[]> &
				Record<string, unknown>;
			p.from = () => make();
			p.where = () => make();
			p.limit = () => make();
			p.orderBy = () => make();
			return p;
		};
		return make();
	};

	const insertBuilder = () => {
		const builder = {
			values(values: AnyRow | AnyRow[]) {
				const arr = Array.isArray(values) ? values : [values];
				for (const v of arr) {
					// Label the row by its distinguishing column: threads carry
					// `entityId`, comments carry `body`.
					const table = "entityId" in v ? "thread" : "comment";
					options.insertedSink.push({ table, values: v });
				}
				return builder;
			},
			onConflictDoNothing() {
				return builder;
			},
			returning() {
				const rows = options.insertReturning[insertCall] ?? [];
				insertCall += 1;
				return Promise.resolve(rows);
			},
		};
		return builder;
	};

	const handle = {
		select: () => selectBuilder(),
		insert: () => insertBuilder(),
	};
	return handle as unknown as GraphDb & GraphTx;
}

const ORG = "org-1";
const ENTITY = "ent-1";
const USER = "user-1";

describe("createComment (durable object comment, author = caller)", () => {
	test("creates the thread on first comment and appends the comment", async () => {
		const insertedSink: Array<{ table: string; values: AnyRow }> = [];
		const tx = makeHandle({
			selectResults: [
				[{ id: ENTITY }], // assertEntityInOrg → entity is in org
				[], // getOrCreateThread → no existing thread
			],
			insertReturning: [
				[{ id: "thread-1" }], // thread insert returning
				[
					{
						id: "comment-1",
						threadId: "thread-1",
						authorUserId: USER,
						body: "hello",
						createdAt: new Date("2026-01-01T00:00:00Z"),
					},
				], // comment insert returning
			],
			insertedSink,
		});

		const result = await createComment(tx, {
			orgId: ORG,
			entityId: ENTITY,
			v2ProjectId: "proj-1",
			authorUserId: USER,
			body: "hello",
		});

		expect(result.id).toBe("comment-1");
		expect(result.threadId).toBe("thread-1");
		// Author is the caller, never client-supplied.
		expect(result.authorUserId).toBe(USER);

		// The thread was created scoped to the org+entity+project; the comment
		// carries the org + author.
		const thread = insertedSink.find((i) => i.table === "thread");
		expect(thread?.values.organizationId).toBe(ORG);
		expect(thread?.values.entityId).toBe(ENTITY);
		expect(thread?.values.v2ProjectId).toBe("proj-1");

		const comment = insertedSink.find((i) => i.table === "comment");
		expect(comment?.values.organizationId).toBe(ORG);
		expect(comment?.values.authorUserId).toBe(USER);
		expect(comment?.values.body).toBe("hello");
	});

	test("reuses an existing thread (no second thread row)", async () => {
		const insertedSink: Array<{ table: string; values: AnyRow }> = [];
		const tx = makeHandle({
			selectResults: [
				[{ id: ENTITY }], // entity in org
				[{ id: "thread-existing" }], // existing thread found
			],
			insertReturning: [
				[
					{
						id: "comment-2",
						threadId: "thread-existing",
						authorUserId: USER,
						body: "again",
						createdAt: new Date(),
					},
				], // only the comment insert runs
			],
			insertedSink,
		});

		const result = await createComment(tx, {
			orgId: ORG,
			entityId: ENTITY,
			v2ProjectId: null,
			authorUserId: USER,
			body: "again",
		});

		expect(result.threadId).toBe("thread-existing");
		// No thread insert happened — only the comment.
		expect(insertedSink.some((i) => i.table === "thread")).toBe(false);
		expect(insertedSink.filter((i) => i.table === "comment")).toHaveLength(1);
	});

	test("rejects when the anchored object is not in the caller's org (cross-org)", async () => {
		const insertedSink: Array<{ table: string; values: AnyRow }> = [];
		const tx = makeHandle({
			// assertEntityInOrg finds NO row (entity belongs to another org) → throws
			// before any thread/comment is touched.
			selectResults: [[]],
			insertReturning: [],
			insertedSink,
		});

		await expect(
			createComment(tx, {
				orgId: ORG,
				entityId: "ent-other-org",
				v2ProjectId: null,
				authorUserId: USER,
				body: "leak?",
			}),
		).rejects.toThrow(/not found/i);

		// Nothing was written.
		expect(insertedSink).toHaveLength(0);
	});
});

describe("listComments (org-scoped, oldest first)", () => {
	test("returns the thread's comments when the object is in the org", async () => {
		const rows = [
			{
				id: "c1",
				threadId: "t1",
				authorUserId: USER,
				body: "first",
				createdAt: new Date("2026-01-01T00:00:00Z"),
			},
			{
				id: "c2",
				threadId: "t1",
				authorUserId: USER,
				body: "second",
				createdAt: new Date("2026-01-02T00:00:00Z"),
			},
		];
		const db = makeHandle({
			selectResults: [
				[{ id: ENTITY }], // entity in org
				[{ id: "t1" }], // thread found
				rows, // comments
			],
			insertReturning: [],
			insertedSink: [],
		});

		const result = await listComments(db, {
			orgId: ORG,
			entityId: ENTITY,
			limit: 100,
		});
		expect(result).toHaveLength(2);
		expect(result[0]?.body).toBe("first");
		expect(result[1]?.body).toBe("second");
	});

	test("returns an empty list when the object has no thread yet", async () => {
		const db = makeHandle({
			selectResults: [
				[{ id: ENTITY }], // entity in org
				[], // no thread
			],
			insertReturning: [],
			insertedSink: [],
		});
		const result = await listComments(db, {
			orgId: ORG,
			entityId: ENTITY,
			limit: 100,
		});
		expect(result).toEqual([]);
	});

	test("rejects listing comments on a cross-org object", async () => {
		const db = makeHandle({
			selectResults: [[]], // entity NOT in org
			insertReturning: [],
			insertedSink: [],
		});
		await expect(
			listComments(db, { orgId: ORG, entityId: "ent-other", limit: 100 }),
		).rejects.toThrow(/not found/i);
	});
});
