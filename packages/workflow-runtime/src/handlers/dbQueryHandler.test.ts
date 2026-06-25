import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	type DbQueryPort,
	type DbQueryRequest,
	MAX_RECORDED_ROWS,
	makeDbQueryHandler,
	validateReadOnlySql,
} from "./dbQueryHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "q1",
		block: { type: "db_query", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

/** Capturing fake port: records the request so a test can assert that an
 *  injection string travelled as a BOUND VALUE, not as SQL text. */
function fakePort(rows: Array<Record<string, unknown>> = []): {
	port: DbQueryPort;
	calls: DbQueryRequest[];
} {
	const calls: DbQueryRequest[] = [];
	const port: DbQueryPort = async (req) => {
		calls.push(req);
		return { rows };
	};
	return { port, calls };
}

describe("makeDbQueryHandler", () => {
	test("db_query with a bind param returns rows", async () => {
		const { port, calls } = fakePort([
			{ id: 1, name: "alpha" },
			{ id: 2, name: "beta" },
		]);
		const handler = makeDbQueryHandler(port);
		const res = await handler(
			ctx({
				sql: "select id, name from items where org = :orgId",
				params: { orgId: "org-1" },
			}),
		);
		expect(res.handle).toBe("out");
		expect(res.output?.rows).toEqual([
			{ id: 1, name: "alpha" },
			{ id: 2, name: "beta" },
		]);
		expect(res.output?.rowCount).toBe(2);
		// The SQL text is forwarded verbatim and the value rides as a bound param.
		expect(calls[0]?.sql).toBe("select id, name from items where org = :orgId");
		expect(calls[0]?.params).toEqual([{ name: "orgId", value: "org-1" }]);
	});

	test("an injection string is passed as a bound value, NOT executed as SQL", async () => {
		const { port, calls } = fakePort([]);
		const handler = makeDbQueryHandler(port);
		const evil = "x'; DROP TABLE users; --";
		const res = await handler(
			ctx({
				sql: "select * from items where name = :name",
				params: { name: evil },
			}),
		);
		expect(res.handle).toBe("out");
		// The dangerous string is a bound VALUE — it never becomes part of the SQL
		// text, so it cannot be parsed/executed as a statement.
		expect(calls[0]?.sql).toBe("select * from items where name = :name");
		expect(calls[0]?.params).toEqual([{ name: "name", value: evil }]);
		expect(calls[0]?.sql).not.toContain("DROP TABLE");
	});

	test("rejects a non-SELECT statement before touching the port (DDL/DML allowlist)", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbQueryHandler(port);
		const res = await handler(
			ctx({ sql: "delete from items where id = :id", params: { id: 1 } }),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_QUERY_NOT_SELECT");
		expect(calls.length).toBe(0); // port never invoked
	});

	test("rejects DML hidden inside a CTE", async () => {
		const { port, calls } = fakePort();
		const handler = makeDbQueryHandler(port);
		const res = await handler(
			ctx({
				sql: "with x as (delete from items returning id) select * from x",
			}),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_QUERY_DDL_DML_FORBIDDEN");
		expect(calls.length).toBe(0);
	});

	test("rejects statement-stacking", async () => {
		const { port } = fakePort();
		const handler = makeDbQueryHandler(port);
		const res = await handler(ctx({ sql: "select 1; select 2" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_QUERY_MULTIPLE_STATEMENTS");
	});

	test("missing SQL routes to error", async () => {
		const { port } = fakePort();
		const handler = makeDbQueryHandler(port);
		const res = await handler(ctx({}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_QUERY_SQL_MISSING");
	});

	test("a port failure routes to the error handle", async () => {
		const handler = makeDbQueryHandler(async () => {
			throw new Error("connection reset");
		});
		const res = await handler(ctx({ sql: "select 1" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("DB_QUERY_FAILED");
		expect(res.error?.message).toContain("connection reset");
	});

	test("recorded rows are capped at MAX_RECORDED_ROWS", async () => {
		const many = Array.from({ length: MAX_RECORDED_ROWS + 5 }, (_, i) => ({
			i,
		}));
		const { port } = fakePort(many);
		const handler = makeDbQueryHandler(port);
		const res = await handler(ctx({ sql: "select i from gen" }));
		expect(res.handle).toBe("out");
		expect((res.output?.rows as unknown[]).length).toBe(MAX_RECORDED_ROWS);
		expect(res.output?.rowCount).toBe(MAX_RECORDED_ROWS + 5);
		expect(res.output?.truncated).toBe(true);
	});
});

describe("validateReadOnlySql", () => {
	test("accepts a plain SELECT", () => {
		expect(validateReadOnlySql("select 1")).toBeNull();
	});
	test("accepts a read-only WITH … SELECT", () => {
		expect(
			validateReadOnlySql("with x as (select 1 as n) select n from x"),
		).toBeNull();
	});
	test("accepts SELECT masked by a leading comment", () => {
		expect(validateReadOnlySql("-- a note\nselect 1")).toBeNull();
	});
	test("rejects a DELETE hidden behind a comment", () => {
		expect(validateReadOnlySql("-- ok\ndelete from t")?.code).toBe(
			"DB_QUERY_NOT_SELECT",
		);
	});
});
