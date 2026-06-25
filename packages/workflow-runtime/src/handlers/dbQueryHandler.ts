import type { BlockHandler, BlockHandlerContext } from "../executor/types";
import { resolvePromptTemplate } from "./modelHandler";

/**
 * A single named bind parameter for a `db_query` / `db_write` statement. The
 * `value` is passed to the driver as a *bound* parameter (never interpolated
 * into the SQL text), so untrusted runtime input can never alter the statement
 * structure — this is the SQL-injection defense the execution spec requires.
 */
export interface DbBoundParam {
	name: string;
	value: unknown;
}

/** Request handed to the injected read port for a `db_query` block. */
export interface DbQueryRequest {
	/**
	 * The SELECT statement text. Param placeholders are referenced by name as
	 * `:name` and substituted by the port with positional bind markers — the
	 * value is never concatenated into the text.
	 */
	sql: string;
	/** Named bind values, resolved from the node config / merged input. */
	params: DbBoundParam[];
}

export interface DbQueryResult {
	rows: Array<Record<string, unknown>>;
}

/**
 * Impure read port: runs a parametrized SELECT inside the run's org-scoped DB
 * context and returns the rows. Injected by the run-service so the executor
 * stays DB-free (mirrors {@link import("./ragHandler").RetrievalPort}). The
 * port is constructed bound to a single organization's scope, so a node can
 * never read another tenant's data. Implementations bind every param
 * positionally and MAY throw on a DB error (the handler maps that to `error`).
 */
export type DbQueryPort = (req: DbQueryRequest) => Promise<DbQueryResult>;

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Read-only allowlist: a `db_query` node may run exactly one SELECT (or a
 * read-only WITH … SELECT). Any DDL/DML verb is rejected by the pure handler
 * BEFORE the port is ever invoked, so a read node can never mutate data even if
 * the port were mis-wired. Comparison is on the first SQL keyword after stripping
 * leading comments/whitespace; a trailing second statement (`;` + more) is also
 * rejected to prevent statement-stacking.
 */
const READ_VERB_RE = /^\s*(?:with\b[\s\S]*?\bselect\b|select\b)/i;

/** Verbs that must never appear in a read node, even inside a CTE. */
const FORBIDDEN_IN_READ_RE =
	/\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|merge|call|do|copy)\b/i;

/**
 * Strip leading `--` line comments and `/* *\/` block comments so the verb check
 * sees the first real keyword (a comment can otherwise mask `DELETE` etc.).
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
 * Validate a read statement against the allowlist. Returns an error code +
 * message when the statement is not a single read-only SELECT, else `null`.
 */
export function validateReadOnlySql(
	sql: string,
): { code: string; message: string } | null {
	const body = stripLeadingComments(sql);
	if (!READ_VERB_RE.test(body)) {
		return {
			code: "DB_QUERY_NOT_SELECT",
			message:
				"db_query only permits a single read-only SELECT (or WITH … SELECT) statement.",
		};
	}
	if (FORBIDDEN_IN_READ_RE.test(body)) {
		return {
			code: "DB_QUERY_DDL_DML_FORBIDDEN",
			message:
				"db_query rejected a statement containing a write/DDL keyword (insert/update/delete/drop/…).",
		};
	}
	if (hasTrailingStatement(sql)) {
		return {
			code: "DB_QUERY_MULTIPLE_STATEMENTS",
			message:
				"db_query rejected statement-stacking (only one statement allowed).",
		};
	}
	return null;
}

/**
 * Resolve the named bind params for a db node from `subBlocks.params`. The map's
 * VALUES may carry `{{path}}` placeholders expanded from the merged upstream
 * input (same resolver the model/http nodes use) so an upstream node's output
 * can feed a param — but the resolved result is always passed to the port as a
 * *bound value*, never spliced into the SQL text. Non-string literal values
 * (numbers, booleans, null) pass through unchanged.
 */
export function resolveBoundParams(
	sub: Record<string, unknown>,
	input: Record<string, unknown>,
): DbBoundParam[] {
	const raw = sub.params;
	if (raw == null || typeof raw !== "object") return [];
	const out: DbBoundParam[] = [];
	for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
		const resolved =
			typeof value === "string" ? resolvePromptTemplate(value, input) : value;
		out.push({ name, value: resolved });
	}
	return out;
}

/** Max number of rows recorded on the step output (payload-size cap). */
export const MAX_RECORDED_ROWS = 1000;

/**
 * Build the `db_query` (read) block handler. Reads the SQL + named params from
 * `block.subBlocks`, enforces the read-only allowlist (rejecting DDL/DML and
 * statement-stacking) BEFORE the port is touched, resolves bind values from the
 * node config / merged input, then delegates the parametrized SELECT to the
 * injected org-scoped {@link DbQueryPort}. Returns `{ output: { rows, rowCount } }`
 * on success (rows capped at {@link MAX_RECORDED_ROWS}) or routes failures to the
 * `error` handle.
 */
export function makeDbQueryHandler(query: DbQueryPort): BlockHandler {
	return async (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const sqlText = asString(sub.sql);
		if (sqlText == null || sqlText.trim() === "") {
			return {
				handle: "error",
				error: {
					code: "DB_QUERY_SQL_MISSING",
					message: "db_query node has no SQL configured (subBlocks.sql).",
					blockId: ctx.blockId,
				},
			};
		}

		const invalid = validateReadOnlySql(sqlText);
		if (invalid != null) {
			return {
				handle: "error",
				error: { ...invalid, blockId: ctx.blockId },
			};
		}

		const params = resolveBoundParams(sub, ctx.input);

		try {
			const result = await query({ sql: sqlText, params });
			const rows = result.rows.slice(0, MAX_RECORDED_ROWS);
			return {
				handle: "out",
				output: {
					rows,
					rowCount: result.rows.length,
					truncated: result.rows.length > rows.length,
				},
			};
		} catch (err) {
			return {
				handle: "error",
				error: {
					code: "DB_QUERY_FAILED",
					message: err instanceof Error ? err.message : String(err),
					blockId: ctx.blockId,
				},
			};
		}
	};
}
