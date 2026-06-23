import { describe, expect, it, mock } from "bun:test";

// The seed module imports ./client (Neon clients) at module load. Stub it so the
// import chain resolves without a DATABASE_URL — these tests drive the function
// through an injected fake executor and never touch the real default `dbWs`.
mock.module("./client", () => ({ db: {}, dbWs: {} }));

const { seedDemoProject } = await import("./seed-demo-project");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Build a fake drizzle `Executor` for `seedDemoProject`.
 *
 * - `select().from().where().limit()` resolves to the next array from
 *   `selectResults` (one entry consumed per call, so we can model the
 *   first-empty-then-found race path).
 * - `insert().values(row).onConflictDoNothing().returning()` resolves to
 *   `insertResult`, and the inserted `row` is captured for assertions.
 */
function createExecutor(opts: {
	selectResults: Array<Array<{ id: string }>>;
	insertResult: Array<{ id: string }>;
}) {
	const insertedRows: Array<Record<string, unknown>> = [];

	const insertChain = {
		onConflictDoNothing: mock(() => insertChain),
		returning: mock(async () => opts.insertResult),
	};
	const values = mock((row: Record<string, unknown>) => {
		insertedRows.push(row);
		return insertChain;
	});
	const insert = mock(() => ({ values }));

	let selectIdx = 0;
	const limit = mock(async () => {
		const result = opts.selectResults[selectIdx] ?? [];
		selectIdx += 1;
		return result;
	});
	const selectChain = {
		from: mock(() => selectChain),
		where: mock(() => selectChain),
		limit,
	};
	const select = mock(() => selectChain);

	return {
		executor: { select, insert } as never,
		select,
		insert,
		values,
		insertedRows,
		selectCalls: () => selectIdx,
	};
}

describe("seedDemoProject (@rox/db — org-level demo project seed, issue #26)", () => {
	it("inserts the demo project when none exists and returns its id", async () => {
		const fake = createExecutor({
			selectResults: [[]], // no existing demo project
			insertResult: [{ id: DEMO_PROJECT_ID }],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(DEMO_PROJECT_ID);
		expect(fake.insert).toHaveBeenCalledTimes(1);
		expect(fake.values).toHaveBeenCalledTimes(1);

		// The inserted row carries the demo project's identifying metadata, scoped
		// to the org so the (organizationId, slug) unique constraint makes the seed
		// idempotent. NOTE: color/icon are intentionally NOT asserted here — the
		// @rox/db `projects` table (cloud/org repo metadata) has no color/icon
		// columns. The yellow color + `pizdariki.svg` icon live in the host-service
		// demo constants (asserted in host-service/.../demo-project.test.ts).
		const row = fake.insertedRows[0];
		expect(row).toMatchObject({
			organizationId: ORG_ID,
			name: "Demo Project",
			slug: "demo-project",
		});
		expect(typeof row?.repoOwner).toBe("string");
		expect(typeof row?.repoUrl).toBe("string");
	});

	it("is idempotent: returns the existing id without inserting", async () => {
		const fake = createExecutor({
			selectResults: [[{ id: DEMO_PROJECT_ID }]], // demo project already present
			insertResult: [],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(DEMO_PROJECT_ID);
		expect(fake.insert).not.toHaveBeenCalled();
		expect(fake.selectCalls()).toBe(1);
	});

	it("falls back to a re-read when a concurrent insert wins the race", async () => {
		// First select: empty (decide to insert). Insert returns nothing
		// (onConflictDoNothing — another writer committed the row). Second select
		// returns the row the racing writer committed.
		const fake = createExecutor({
			selectResults: [[], [{ id: DEMO_PROJECT_ID }]],
			insertResult: [],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(DEMO_PROJECT_ID);
		expect(fake.insert).toHaveBeenCalledTimes(1);
		expect(fake.selectCalls()).toBe(2);
	});
});
