import { describe, expect, it, mock } from "bun:test";

// The seed module imports ./client (Neon clients) at module load. Stub it so the
// import chain resolves without a DATABASE_URL — these tests drive the function
// through an injected fake executor and never touch the real default `dbWs`.
mock.module("./client", () => ({ db: {}, dbWs: {} }));

const {
	seedDemoProject,
	DEMO_PROJECT_COLOR,
	DEMO_PROJECT_ICON_SVG,
	DEMO_PROJECT_ICON_DATA_URL,
} = await import("./seed-demo-project");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const V1_DEMO_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const V2_DEMO_PROJECT_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Build a fake drizzle `Executor` for `seedDemoProject`.
 *
 * `seedDemoProject(orgId, executor)` (the injected-executor branch) seeds BOTH
 * the V1 `projects` table and the V2 `v2_projects` table on the passed executor,
 * V1 first then V2. So a single call issues two select→(maybe insert) cycles.
 *
 * - `select().from(table).where().limit()` resolves to the next array from
 *   `selectResults` (one entry consumed per `.limit()` call, so we can model the
 *   first-empty-then-found race path on either table).
 * - `insert(table).values(row).onConflictDoNothing().returning()` resolves to the
 *   next array from `insertResults`; the inserted `row` and the target table name
 *   are captured for assertions.
 *
 * The fake records which table each select/insert targeted via the first arg
 * passed to `.from(table)` / `.insert(table)`, comparing against the real table
 * objects' inferred `Symbol`-less identity using the drizzle table name.
 */
function tableName(table: unknown): string {
	// drizzle pg tables expose their SQL name via a well-known symbol; fall back
	// to a stringify so the fake never throws on an unexpected shape.
	const sym = Object.getOwnPropertySymbols(table as object).find((s) =>
		s.toString().includes("Name"),
	);
	if (sym) {
		const value = (table as Record<symbol, unknown>)[sym];
		if (typeof value === "string") return value;
	}
	return String(table);
}

function createExecutor(opts: {
	selectResults: Array<Array<{ id: string }>>;
	insertResults: Array<Array<{ id: string }>>;
}) {
	const insertedRows: Array<{ table: string; row: Record<string, unknown> }> =
		[];
	const selectedTables: string[] = [];

	let insertIdx = 0;
	const makeInsert = (table: unknown) => {
		const captured = tableName(table);
		const insertChain = {
			onConflictDoNothing: mock(() => insertChain),
			returning: mock(async () => {
				const result = opts.insertResults[insertIdx] ?? [];
				insertIdx += 1;
				return result;
			}),
		};
		const values = mock((row: Record<string, unknown>) => {
			insertedRows.push({ table: captured, row });
			return insertChain;
		});
		return { values };
	};
	const insert = mock((table: unknown) => makeInsert(table));

	let selectIdx = 0;
	const makeSelectChain = () => {
		const chain = {
			from: mock((table: unknown) => {
				selectedTables.push(tableName(table));
				return chain;
			}),
			where: mock(() => chain),
			limit: mock(async () => {
				const result = opts.selectResults[selectIdx] ?? [];
				selectIdx += 1;
				return result;
			}),
		};
		return chain;
	};
	const select = mock(() => makeSelectChain());

	return {
		executor: { select, insert } as never,
		select,
		insert,
		insertedRows,
		selectedTables,
		selectCalls: () => selectIdx,
		insertCalls: () => insertIdx,
	};
}

describe("seedDemoProject (@rox/db — org-level demo project seed, issue #26)", () => {
	it("seeds BOTH the V1 projects and V2 v2_projects rows on first run and returns the V2 id", async () => {
		// V1 select empty -> V1 insert; V2 select empty -> V2 insert.
		const fake = createExecutor({
			selectResults: [[], []],
			insertResults: [
				[{ id: V1_DEMO_PROJECT_ID }],
				[{ id: V2_DEMO_PROJECT_ID }],
			],
		});

		// Returns the V2 id — the row the live desktop projects list reads.
		const id = await seedDemoProject(ORG_ID, fake.executor);
		expect(id).toBe(V2_DEMO_PROJECT_ID);

		// Both surfaces were written, exactly once each, in order (V1 then V2).
		expect(fake.insertedRows).toHaveLength(2);
		expect(fake.insertedRows[0]?.table).toBe("projects");
		expect(fake.insertedRows[1]?.table).toBe("v2_projects");

		// V1 row carries the legacy repo metadata, org-scoped + idempotent slug.
		expect(fake.insertedRows[0]?.row).toMatchObject({
			organizationId: ORG_ID,
			name: "Demo Project",
			slug: "demo-project",
		});
		expect(typeof fake.insertedRows[0]?.row.repoOwner).toBe("string");
		expect(typeof fake.insertedRows[0]?.row.repoUrl).toBe("string");

		// V2 row (the VISIBLE surface) is org-scoped with the same demo slug so
		// the (organizationId, slug) unique constraint makes it idempotent, and
		// carries the self-contained pizdariki `data:` icon URL the renderer
		// renders as the demo project's yellow accent (issue #26 follow-up).
		expect(fake.insertedRows[1]?.row).toMatchObject({
			organizationId: ORG_ID,
			name: "Demo Project",
			slug: "demo-project",
			iconUrl: DEMO_PROJECT_ICON_DATA_URL,
		});
	});

	it("is idempotent: returns the existing V2 id without inserting either surface", async () => {
		// V1 select finds the row; V2 select finds the row. No inserts.
		const fake = createExecutor({
			selectResults: [
				[{ id: V1_DEMO_PROJECT_ID }],
				[{ id: V2_DEMO_PROJECT_ID }],
			],
			insertResults: [],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(V2_DEMO_PROJECT_ID);
		expect(fake.insert).not.toHaveBeenCalled();
		// One select per surface (V1, V2), each short-circuiting on the found row.
		expect(fake.selectCalls()).toBe(2);
	});

	it("is idempotent for V2 even when only the V1 row pre-exists (partial prior run)", async () => {
		// V1 select finds the row (no V1 insert). V2 select empty -> V2 insert.
		const fake = createExecutor({
			selectResults: [[{ id: V1_DEMO_PROJECT_ID }], []],
			insertResults: [[{ id: V2_DEMO_PROJECT_ID }]],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(V2_DEMO_PROJECT_ID);
		// Only the V2 surface was inserted; V1 was already present.
		expect(fake.insertedRows).toHaveLength(1);
		expect(fake.insertedRows[0]?.table).toBe("v2_projects");
	});

	it("falls back to a re-read when a concurrent insert wins the V2 race", async () => {
		// V1: select empty -> insert returns the row.
		// V2: select empty -> insert returns nothing (onConflictDoNothing — another
		//     writer committed) -> re-read returns the racing writer's row.
		const fake = createExecutor({
			selectResults: [[], [], [{ id: V2_DEMO_PROJECT_ID }]],
			insertResults: [[{ id: V1_DEMO_PROJECT_ID }], []],
		});

		const id = await seedDemoProject(ORG_ID, fake.executor);

		expect(id).toBe(V2_DEMO_PROJECT_ID);
		// V1 insert (1) + V2 insert (1) attempted.
		expect(fake.insertCalls()).toBe(2);
		// V1 select (1) + V2 select (1) + V2 race re-read (1).
		expect(fake.selectCalls()).toBe(3);
		expect(fake.selectedTables).toEqual([
			"projects",
			"v2_projects",
			"v2_projects",
		]);
	});

	it("throws if the V2 row can neither be inserted nor re-read", async () => {
		// V1 ok. V2: select empty -> insert empty -> re-read still empty => throw.
		const fake = createExecutor({
			selectResults: [[], [], []],
			insertResults: [[{ id: V1_DEMO_PROJECT_ID }], []],
		});

		await expect(seedDemoProject(ORG_ID, fake.executor)).rejects.toThrow(
			"Failed to seed demo v2 project",
		);
	});
});

describe("demo-project icon constants (#26 renderer follow-up)", () => {
	it("keeps the inline SVG a yellow #facc15 pizzaslice (matches the bundled asset)", () => {
		// The yellow accent is delivered by the icon fill itself (the live
		// dashboard ProjectThumbnail has no separate color prop), so the SVG MUST
		// be filled with DEMO_PROJECT_COLOR.
		expect(DEMO_PROJECT_COLOR).toBe("#facc15");
		expect(DEMO_PROJECT_ICON_SVG).toContain(`fill="${DEMO_PROJECT_COLOR}"`);
		expect(DEMO_PROJECT_ICON_SVG.startsWith("<svg")).toBe(true);
		expect(DEMO_PROJECT_ICON_SVG.trimEnd().endsWith("</svg>")).toBe(true);
	});

	it("derives a renderer-resolvable data: URL that round-trips to the SVG", () => {
		// Must be a data:image/svg+xml URL so the renderer's <img src> resolves it
		// with no bundled asset / custom protocol (renderer CSP allows img-src data:).
		expect(
			DEMO_PROJECT_ICON_DATA_URL.startsWith("data:image/svg+xml;base64,"),
		).toBe(true);

		const base64 = DEMO_PROJECT_ICON_DATA_URL.slice(
			"data:image/svg+xml;base64,".length,
		);
		const decoded = Buffer.from(base64, "base64").toString("utf8");
		expect(decoded).toBe(DEMO_PROJECT_ICON_SVG);
		// The decoded payload still carries the yellow fill end-to-end.
		expect(decoded).toContain("#facc15");
	});
});
