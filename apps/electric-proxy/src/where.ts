import { and, eq, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type { WhereClause } from "./auth";
import { getTableScope } from "./table-scopes";

const qb = new QueryBuilder();

/** Render a drizzle where-expression to a bare SQL fragment + ordered params,
 *  matching the `$1..$n` placeholder shape `buildUpstreamUrl` expects. */
function renderFragment(
	whereExpr: ReturnType<typeof eq> | ReturnType<typeof and>,
): WhereClause {
	const { sql: query, params } = qb
		.select()
		.from(sql`t`)
		.where(whereExpr)
		.toSQL();
	const fragment = query.replace(/^select .* from .* where\s+/i, "");
	return { fragment, params };
}

function buildOrgScoped(column: PgColumn, organizationId: string): WhereClause {
	return renderFragment(
		eq(sql`${sql.identifier(column.name)}`, organizationId),
	);
}

function buildUserScoped(
	organizationColumn: PgColumn,
	userColumn: PgColumn,
	organizationId: string,
	userId: string,
): WhereClause {
	return renderFragment(
		and(
			eq(sql`${sql.identifier(organizationColumn.name)}`, organizationId),
			eq(sql`${sql.identifier(userColumn.name)}`, userId),
		),
	);
}

/**
 * Build the server-side row-level `where` clause for a synced table, derived
 * entirely from the declarative `TABLE_SCOPES` registry (single source of
 * truth shared with the index.ts membership/user-scope guards and the
 * electric.ts column restrictions). Returns `null` for unknown tables
 * (fail-closed → 400 upstream).
 */
export function buildWhereClause(
	tableName: string,
	organizationId: string,
	organizationIds: string[],
	userId: string,
): WhereClause | null {
	const scope = getTableScope(tableName);
	if (!scope) {
		return null;
	}

	if (scope.custom) {
		return scope.custom({ organizationId, organizationIds, userId });
	}

	if (scope.orgColumn && scope.userColumn) {
		return buildUserScoped(
			scope.orgColumn,
			scope.userColumn,
			organizationId,
			userId,
		);
	}

	if (scope.orgColumn) {
		return buildOrgScoped(scope.orgColumn, organizationId);
	}

	// A registry entry with neither a column scope nor a custom builder is a
	// misconfiguration; fail closed rather than sync everything.
	return null;
}
