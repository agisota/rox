import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import {
	type DbBoundParam,
	MAX_RECORDED_ROWS,
	resolveBoundParams,
} from "./dbQueryHandler";

/** Request handed to the injected write port for a `db_write` block. */
export interface DbWriteRequest {
	/**
	 * The INSERT/UPDATE/DELETE statement text. Param placeholders are referenced
	 * by name as `:name`; the port substitutes positional bind markers and binds
	 * the value — never concatenated into the text (SQL-injection safe).
	 */
	sql: string;
	/** Named bind values, resolved from the node config / merged input. */
	params: DbBoundParam[];
}

export interface DbWriteResult {
	/** Affected row count reported by the driver, when available. */
	rowCount: number;
	/** Rows returned by a `RETURNING` clause, if the statement had one. */
	rows: Array<Record<string, unknown>>;
}

/**
 * Impure write port: runs a parametrized INSERT/UPDATE/DELETE inside a single
 * transaction in the run's org-scoped DB context, rolling back on any error.
 * Injected by the run-service so the executor stays DB-free. The port is
 * constructed bound to one organization's scope, so a write node can never
 * mutate another tenant's data. Implementations bind every param positionally
 * and MUST roll the transaction back (rethrowing) on failure — the handler maps
 * the throw to the `error` handle.
 */
export type DbWritePort = (req: DbWriteRequest) => Promise<DbWriteResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Strip leading `--` line and block comments so the verb check sees the first
 * real keyword (kept local to avoid a cross-handler runtime import; the query
 * handler has its own copy of the same trivial helper).
 */
function stripLeadingComments(sql: string): string {
	let s = sql;
	let prev: string;
	do {
		prev = s;
		s = s.replace(/^\s+/, "");
		s = s.replace(/^--[^\n]*\n?/, "");
		s = s.replace(/^\/\*[\s\S]*?\*\//, "");
	} while (s !== prev);
	return s;
}

/** Reject statement-stacking: anything after the first terminating `;`. */
function hasTrailingStatement(sql: string): boolean {
	const trimmed = sql.trimEnd().replace(/;+\s*$/, "");
	return trimmed.includes(";");
}

/**
 * Write allowlist: a `db_write` node may run exactly one INSERT/UPDATE/DELETE
 * (optionally fronted by a `WITH …` CTE). Schema-altering DDL (DROP/TRUNCATE/
 * ALTER/CREATE/GRANT/REVOKE) is rejected — a workflow write node is for data
 * mutation, not schema surgery. Validation runs in the pure handler BEFORE the
 * port is invoked.
 */
const WRITE_VERB_RE =
	/^\s*(?:with\b[\s\S]*?\b(?:insert|update|delete)\b|insert\b|update\b|delete\b)/i;

const FORBIDDEN_DDL_RE =
	/\b(drop|truncate|alter|create|grant|revoke|do|copy)\b/i;

/**
 * Validate a write statement against the allowlist. Returns an error code +
 * message when it is not a single INSERT/UPDATE/DELETE, else `null`.
 */
export function validateWriteSql(
	sql: string,
): { code: string; message: string } | null {
	const body = stripLeadingComments(sql);
	if (!WRITE_VERB_RE.test(body)) {
		return {
			code: "DB_WRITE_NOT_DML",
			message:
				"db_write only permits a single INSERT, UPDATE, or DELETE statement.",
		};
	}
	if (FORBIDDEN_DDL_RE.test(body)) {
		return {
			code: "DB_WRITE_DDL_FORBIDDEN",
			message:
				"db_write rejected a statement containing DDL (drop/truncate/alter/create/…).",
		};
	}
	if (hasTrailingStatement(sql)) {
		return {
			code: "DB_WRITE_MULTIPLE_STATEMENTS",
			message:
				"db_write rejected statement-stacking (only one statement allowed).",
		};
	}
	return null;
}

/**
 * Build the `db_write` (INSERT/UPDATE/DELETE, risk:'high') block handler. Reads
 * the SQL + named params from `block.subBlocks`, enforces the write allowlist
 * (rejecting DDL and statement-stacking) BEFORE the port is touched, resolves
 * bind values from the node config / merged input, then delegates the
 * parametrized mutation to the injected org-scoped {@link DbWritePort}, which
 * runs it in a transaction and rolls back on error. Returns
 * `{ output: { rowCount, rows } }` on success (rows capped at
 * {@link MAX_RECORDED_ROWS}) or routes the rolled-back failure to the `error`
 * handle.
 */
export function makeDbWriteHandler(write: DbWritePort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const sqlText = asString(sub.sql);
		if (sqlText == null || sqlText.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "DB_WRITE_SQL_MISSING",
					message: "db_write node has no SQL configured (subBlocks.sql).",
					blockId: ctx.blockId,
				},
			};
		}

		const invalid = validateWriteSql(sqlText);
		if (invalid != null) {
			return {
				handle: "error",
				error: { ...invalid, blockId: ctx.blockId },
			};
		}

		const params = resolveBoundParams(sub, ctx.input);

		try {
			const result = await write({ sql: sqlText, params });
			const rows = result.rows.slice(0, MAX_RECORDED_ROWS);
			return {
				handle: "out",
				output: {
					rowCount: result.rowCount,
					rows,
					truncated: result.rows.length > rows.length,
				},
			};
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "DB_WRITE_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
