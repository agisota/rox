import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import type { WhereClause } from "./auth";
import { getColumnRestriction } from "./table-scopes";
import type { Env } from "./types";

const PROTOCOL_PARAMS = new Set(ELECTRIC_PROTOCOL_QUERY_PARAMS);

export function buildUpstreamUrl(
	clientUrl: URL,
	tableName: string,
	whereClause: WhereClause,
	env: Env,
): URL {
	const hasSourceCredentials =
		Boolean(env.ELECTRIC_SOURCE_ID) && Boolean(env.ELECTRIC_SOURCE_SECRET);

	const upstream = new URL(env.ELECTRIC_SHAPE_URL ?? "");

	if (hasSourceCredentials) {
		upstream.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID ?? "");
		upstream.searchParams.set("secret", env.ELECTRIC_SOURCE_SECRET ?? "");
	} else {
		upstream.searchParams.set("secret", env.ELECTRIC_SECRET ?? "");
	}

	for (const [key, value] of clientUrl.searchParams) {
		if (PROTOCOL_PARAMS.has(key)) {
			upstream.searchParams.set(key, value);
		}
	}

	upstream.searchParams.set("table", tableName);
	upstream.searchParams.set("where", whereClause.fragment);
	for (let i = 0; i < whereClause.params.length; i++) {
		upstream.searchParams.set(
			`params[${i + 1}]`,
			String(whereClause.params[i]),
		);
	}

	const columns = getColumnRestriction(tableName);
	if (columns) {
		upstream.searchParams.set("columns", columns);
	}
	return upstream;
}
