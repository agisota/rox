import { describe, expect, test } from "bun:test";
import { graphService } from "./graph-service";
import type { GraphTx } from "./types";

type AnyRow = Record<string, unknown>;

/**
 * Minimal chainable Drizzle-like `tx` stub for `graphService.link`. The link
 * path issues: a `select(...).from().where().limit()` per endpoint validation,
 * then `insert(...).values(...).onConflictDoNothing().returning()`. Each select
 * resolves the next queued result-set; the insert records its values and
 * returns the configured edge row.
 */
function makeTx(options: {
	selectResults: AnyRow[][];
	insertReturning: AnyRow[];
	insertedSink: AnyRow[];
}): GraphTx {
	let selectCall = 0;

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
				options.insertedSink.push(...arr);
				return builder;
			},
			onConflictDoNothing() {
				return builder;
			},
			returning() {
				return Promise.resolve(options.insertReturning);
			},
		};
		return builder;
	};

	return {
		select: () => selectBuilder(),
		insert: () => insertBuilder(),
	} as unknown as GraphTx;
}

describe("graphService.link (create edge between two objects)", () => {
	test("rejects when neither targetEntityId nor targetSlug is given", async () => {
		const tx = makeTx({
			selectResults: [],
			insertReturning: [],
			insertedSink: [],
		});
		await expect(
			graphService.link(tx, {
				orgId: "org-1",
				sourceEntityId: "src-1",
				relation: "references",
			}),
		).rejects.toThrow(/exactly one of targetEntityId or targetSlug/);
	});

	test("rejects when BOTH targetEntityId and targetSlug are given", async () => {
		const tx = makeTx({
			selectResults: [],
			insertReturning: [],
			insertedSink: [],
		});
		await expect(
			graphService.link(tx, {
				orgId: "org-1",
				sourceEntityId: "src-1",
				targetEntityId: "tgt-1",
				targetSlug: "tgt",
				relation: "references",
			}),
		).rejects.toThrow(/exactly one of targetEntityId or targetSlug/);
	});

	test("inserts a RESOLVED edge when a targetEntityId is provided", async () => {
		const insertedSink: AnyRow[] = [];
		const tx = makeTx({
			// source-validation row, then target-validation row.
			selectResults: [[{ id: "src-1" }], [{ id: "tgt-1" }]],
			insertReturning: [
				{
					id: "edge-1",
					organizationId: "org-1",
					sourceEntityId: "src-1",
					targetEntityId: "tgt-1",
					relation: "references",
					resolved: true,
				},
			],
			insertedSink,
		});

		const edge = await graphService.link(tx, {
			orgId: "org-1",
			sourceEntityId: "src-1",
			targetEntityId: "tgt-1",
			relation: "references",
		});

		expect(edge.id).toBe("edge-1");
		// The persisted row must be marked resolved with the real target id.
		expect(insertedSink).toHaveLength(1);
		expect(insertedSink[0]).toMatchObject({
			sourceEntityId: "src-1",
			targetEntityId: "tgt-1",
			relation: "references",
			resolved: true,
		});
	});
});
