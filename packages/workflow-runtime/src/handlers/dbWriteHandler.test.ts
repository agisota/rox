import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	type DbWritePort,
	type DbWriteRequest,
	makeDbWriteHandler,
	validateWriteSql,
} from "./dbWriteHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "w1",
		block: { type: "db_write", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

function fakePort(result?: DbWriteRequest extends never ? never : unknown): {
	port: DbWritePort;
	calls: DbWriteRequest[];
} {
	const calls: DbWriteRequest[] = [];
	const port: DbWritePort = async (req) => {
		calls.push(req);
		return { rowCount: 1, rows: [{ id: "new-1" }] };
	};
	void result;
	return { port, calls };
}

describe("makeDbWriteHandler", () => {
	test("db_write with bind params returns affected row count", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbWriteHandler(port);
		const res = await handler(
			ctx({
				sql: "insert into items (name, org) values (:name, :orgId) returning id",
				params: { name: "alpha", orgId: "org-1" },
			}),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.rowCount).toBe(1);
		expect(res.output?.rows).toEqual([{ id: "new-1" }]);
		expect(calls[0]?.params).toEqual([
			{ name: "name", value: "alpha" },
			{ name: "orgId", value: "org-1" },
		]);
	});

	test("an injection string is bound, not executed as SQL", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbWriteHandler(port);
		const evil = "'); DROP TABLE items; --";
		await handler(
			ctx({
				sql: "insert into items (name) values (:name)",
				params: { name: evil },
			}),
		);
		expect(calls[0]?.sql).toBe("insert into items (name) values (:name)");
		expect(calls[0]?.params).toEqual([{ name: "name", value: evil }]);
		expect(calls[0]?.sql).not.toContain("DROP TABLE");
	});

	test("rolls back on error → routes to the error handle", async () => {
		// The port runs the write in a transaction; a failure rethrows out of the
		// transaction (aborting/rolling it back). The handler maps that to `error`.
		let rolledBack = false;
		const handler = makeDbWriteHandler(async () => {
			rolledBack = true; // stand-in for tx.rollback having fired
			throw new Error("unique violation");
		});
		const res = await handler(
			ctx({ sql: "insert into items (id) values (:id)", params: { id: 1 } }),
		);
		expect(rolledBack).toBe(true);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_WRITE_FAILED");
		expect(res.error?.message).toContain("unique violation");
	});

	test("rejects a SELECT (not a write)", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbWriteHandler(port);
		const res = await handler(ctx({ sql: "select * from items" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_WRITE_NOT_DML");
		expect(calls.length).toBe(0);
	});

	test("rejects DDL (drop/truncate/alter)", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbWriteHandler(port);
		const res = await handler(ctx({ sql: "drop table items" }));
		expect(res.handle).toBe("error");
		// `drop` is not a DML verb, so it fails the verb gate first.
		expect(res.error?.code).toBe("DB_WRITE_NOT_DML");
		expect(calls.length).toBe(0);
	});

	test("rejects an UPDATE that smuggles a TRUNCATE", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbWriteHandler(port);
		const res = await handler(
			ctx({ sql: "update items set n = 1; truncate items" }),
		);
		expect(res.handle).toBe("error");
		// statement-stacking is caught.
		expect([
			"DB_WRITE_MULTIPLE_STATEMENTS",
			"DB_WRITE_DDL_FORBIDDEN",
		]).toContain(res.error?.code ?? "");
		expect(calls.length).toBe(0);
	});

	test("missing SQL routes to error", async () => {
		const { port } = fakePort();
		const res = await makeDbWriteHandler(port)(ctx({}));
		expect(res.error?.code).toBe("DB_WRITE_SQL_MISSING");
	});
});

describe("validateWriteSql", () => {
	test("accepts INSERT/UPDATE/DELETE", () => {
		expect(validateWriteSql("insert into t (a) values (1)")).toBeNull();
		expect(validateWriteSql("update t set a = 1 where id = :id")).toBeNull();
		expect(validateWriteSql("delete from t where id = :id")).toBeNull();
	});
	test("accepts a WITH … UPDATE CTE", () => {
		expect(
			validateWriteSql(
				"with x as (select id from t) update t set a = 1 from x",
			),
		).toBeNull();
	});
	test("rejects bare DDL", () => {
		expect(validateWriteSql("truncate t")?.code).toBe("DB_WRITE_NOT_DML");
	});
});
