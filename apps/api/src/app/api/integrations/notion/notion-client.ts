/**
 * Minimal Notion REST client for the sync foundation.
 *
 * Wraps `POST /search` only — enough to enumerate the pages an integration has
 * access to. The HTTP layer is injectable via `fetchImpl` so unit tests can
 * assert the exact URL/headers/body and stub responses without real network.
 *
 * Pattern note: mirrors the Slack/Telegram clients in this folder (typed
 * request/response, clear thrown Error on non-ok or transport failure) rather
 * than pulling in the official `@notionhq/client` SDK.
 */

import {
	NOTION_API_BASE,
	NOTION_DEFAULT_SEARCH_QUERY,
	NOTION_VERSION,
} from "./constants";

/** Injectable fetch implementation (defaults to the global `fetch`). */
export type FetchImpl = typeof fetch;

/**
 * A single Notion object as returned by `/search`. Only the fields the sync
 * foundation reads are typed; `properties` is intentionally loose because its
 * shape is database-/page-specific (the title lives in a title-type property).
 */
export type NotionSearchResult = {
	id: string;
	url?: string;
	last_edited_time?: string;
	/** Page/database property bag — title is extracted from a title-type prop. */
	properties?: Record<string, unknown>;
	object?: string;
};

/** Parsed `/search` response. */
export type NotionSearchResponse = {
	results: NotionSearchResult[];
	has_more: boolean;
	next_cursor: string | null;
};

export type NotionSearchArgs = {
	/** Decoded Notion access token (Bearer). */
	token: string;
	/**
	 * Free-text query. Empty string (the default) returns all shared pages.
	 * Kept configurable so callers can scope the import.
	 */
	query?: string;
	/** Pagination cursor from a previous response's `next_cursor`. */
	startCursor?: string;
	/** Test seam — overrides the global `fetch`. */
	fetchImpl?: FetchImpl;
};

/** Shape of a raw `/search` payload before normalization. */
type RawSearchPayload = {
	results?: unknown;
	has_more?: unknown;
	next_cursor?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Normalizes one raw result object, dropping anything without a string id. */
function normalizeResult(raw: unknown): NotionSearchResult | null {
	if (!isRecord(raw)) return null;
	const id = raw.id;
	if (typeof id !== "string" || id.length === 0) return null;

	return {
		id,
		url: typeof raw.url === "string" ? raw.url : undefined,
		last_edited_time:
			typeof raw.last_edited_time === "string"
				? raw.last_edited_time
				: undefined,
		properties: isRecord(raw.properties) ? raw.properties : undefined,
		object: typeof raw.object === "string" ? raw.object : undefined,
	};
}

/**
 * Calls `POST /search` and returns the parsed, normalized response.
 *
 * Throws a descriptive `Error` when the HTTP status is not ok or when the
 * transport itself fails, so callers (and tests) can branch on failure clearly.
 */
export async function search({
	token,
	query = NOTION_DEFAULT_SEARCH_QUERY,
	startCursor,
	fetchImpl,
}: NotionSearchArgs): Promise<NotionSearchResponse> {
	const doFetch = fetchImpl ?? fetch;
	const url = `${NOTION_API_BASE}/search`;

	const body: Record<string, unknown> = { query };
	if (startCursor) body.start_cursor = startCursor;

	let response: Response;
	try {
		response = await doFetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Notion-Version": NOTION_VERSION,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
	} catch (cause) {
		// Transport-level failure (DNS, socket, abort) — surface clearly.
		throw new Error(
			`Notion /search request failed: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		);
	}

	if (!response.ok) {
		// Best-effort body text for diagnostics; never throw while reading it.
		let detail = "";
		try {
			detail = await response.text();
		} catch {
			detail = "<unreadable body>";
		}
		throw new Error(
			`Notion /search returned ${response.status} ${response.statusText}: ${detail}`,
		);
	}

	const payload = (await response.json()) as RawSearchPayload;
	const rawResults = Array.isArray(payload.results) ? payload.results : [];
	const results = rawResults
		.map(normalizeResult)
		.filter((r): r is NotionSearchResult => r !== null);

	return {
		results,
		has_more: payload.has_more === true,
		next_cursor:
			typeof payload.next_cursor === "string" ? payload.next_cursor : null,
	};
}
