import { db, dbWs } from "@rox/db/client";
import type {
	DbBoundParam,
	DbQueryRequest,
	DbQueryResult,
	DbWriteRequest,
	DbWriteResult,
} from "@rox/workflow-runtime/handlers";
import { type SQL, sql } from "drizzle-orm";
import type { RagPortScope } from "./rag-port";

/**
 * Org/project scope for a pipeline run, threaded into the db ports so every
 * `db_query` / `db_write` runs bound to exactly one organization (reuses the
 * same scope the RAG port carries). The scope is closed over when the port is
 * built, so a node can never target another tenant — it has no way to widen the
 * organization at call time.
 */
export type DbPortScope = RagPortScope;

/**
 * Compile a node statement that references named params as `:name` into a
 * Drizzle {@link SQL} fragment with the param VALUES bound positionally (driver
 * placeholders), never spliced into the text. This is the SQL-injection defense:
 * `${param.value}` inside a `sql` template emits a `$n` bind marker, so an
 * injection string in a param value is sent to Postgres as a literal value and
 * is never parsed as SQL.
 *
 * Resolution is single-pass over the raw text so a param value that itself
 * contains a `:something` substring can never be re-interpreted as another
 * placeholder. `::` (Postgres cast, e.g. `id::text`) is preserved. An unknown
 * `:name` (no matching param) is left verbatim — Postgres will reject it, which
 * surfaces as a graceful `error` handle rather than a silent mis-bind.
 */
export function compileParametrizedSql(
	text: string,
	params: DbBoundParam[],
): SQL {
	const byName = new Map(params.map((p) => [p.name, p.value]));
	// Build alternating literal/param chunks. `sql.raw` carries the trusted,
	// author-authored SQL text; `sql.param` carries the bound (untrusted) value.
	const parts: SQL[] = [];
	const placeholder = /::|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop
	while ((match = placeholder.exec(text)) !== null) {
		// `::` is a Postgres cast, not a placeholder — leave it in the literal run.
		if (match[0] === "::") continue;
		const name = match[1];
		if (name == null || !byName.has(name)) continue; // unknown → leave verbatim (Postgres errors)
		parts.push(sql.raw(text.slice(lastIndex, match.index)));
		parts.push(sql`${byName.get(name)}`);
		lastIndex = match.index + match[0].length;
	}
	parts.push(sql.raw(text.slice(lastIndex)));
	return sql.join(parts);
}

/**
 * Establish the run's organization scope on a connection/transaction by setting
 * a transaction-local GUC (`SET LOCAL`). The org id is itself a bound value, so
 * it cannot be SQL-injected. Any RLS policy keyed on
 * `current_setting('rox.organization_id')` is then enforced for the wrapped
 * statement; even without RLS, the GUC records the tenant the statement ran
 * under and the port keeps `organizationId` available to the author's WHERE as a
 * bound param.
 */
async function setOrgScope(
	// biome-ignore lint/suspicious/noExplicitAny: tx/db type varies by client
	exec: { execute: (q: SQL) => Promise<any> },
	scope: DbPortScope,
): Promise<void> {
	await exec.execute(
		sql`select set_config('rox.organization_id', ${scope.organizationId}, true)`,
	);
}

/**
 * Always expose the run's tenancy to the node's statement as reserved bound
 * params, so an author's `WHERE organization_id = :orgId` is wired from the run
 * scope (not from untrusted node input). Author-supplied params cannot override
 * these reserved names.
 */
function withScopeParams(
	params: DbBoundParam[],
	scope: DbPortScope,
): DbBoundParam[] {
	const reserved: DbBoundParam[] = [
		{ name: "orgId", value: scope.organizationId },
		{ name: "organizationId", value: scope.organizationId },
		{ name: "projectId", value: scope.v2ProjectId },
		{ name: "v2ProjectId", value: scope.v2ProjectId },
	];
	const reservedNames = new Set(reserved.map((p) => p.name));
	const authored = params.filter((p) => !reservedNames.has(p.name));
	return [...authored, ...reserved];
}

function asRecordRows(rows: unknown): Array<Record<string, unknown>> {
	return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

/**
 * Real read port for the `db_query` block, bound to one organization. Runs the
 * parametrized SELECT inside a transaction that first sets the org GUC, so the
 * read is tenant-scoped. The handler has already rejected any non-SELECT/DDL/DML
 * statement before this port is reached. Lives here (not in
 * `@rox/workflow-runtime`) so the executor stays DB-free.
 */
export function makePipelineDbQuery(
	scope: DbPortScope,
): (req: DbQueryRequest) => Promise<DbQueryResult> {
	return async (req) => {
		const compiled = compileParametrizedSql(
			req.sql,
			withScopeParams(req.params, scope),
		);
		const rows = await db.transaction(async (tx) => {
			await setOrgScope(tx, scope);
			const result = await tx.execute(compiled);
			return asRecordRows(result.rows);
		});
		return { rows };
	};
}

/**
 * Real write port for the `db_write` block, bound to one organization. Runs the
 * parametrized INSERT/UPDATE/DELETE inside a single transaction (org GUC set
 * first) and rolls back on any error — the thrown error propagates out of
 * `transaction(...)`, which aborts the tx, and the handler maps it to the
 * `error` handle. Uses the WebSocket pool client (`dbWs`) since neon-http does
 * not support interactive transactions.
 */
export function makePipelineDbWrite(
	scope: DbPortScope,
): (req: DbWriteRequest) => Promise<DbWriteResult> {
	return async (req) => {
		const compiled = compileParametrizedSql(
			req.sql,
			withScopeParams(req.params, scope),
		);
		return dbWs.transaction(async (tx) => {
			await setOrgScope(tx, scope);
			const result = await tx.execute(compiled);
			const rows = asRecordRows(result.rows);
			return { rowCount: result.rowCount ?? rows.length, rows };
		});
	};
}
