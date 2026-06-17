import { describe, expect, test } from "bun:test";
import { NOTION_API_BASE, NOTION_VERSION } from "./constants";
import { type FetchImpl, listBlockChildren, search } from "./notion-client";

/** Builds a stub `fetch` returning `body` as JSON with the given `status`. */
function jsonFetch(body: unknown, status = 200): FetchImpl {
	return (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		})) as unknown as FetchImpl;
}

describe("notion-client search", () => {
	test("sends the correct URL, headers, and body", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(
				JSON.stringify({ results: [], has_more: false, next_cursor: null }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as FetchImpl;

		await search({ token: "secret-tok", query: "specs", fetchImpl });

		expect(calls).toHaveLength(1);
		const call = calls[0];
		expect(call).toBeDefined();
		if (!call) throw new Error("expected a fetch call");

		expect(call.url).toBe(`${NOTION_API_BASE}/search`);
		expect(call.init?.method).toBe("POST");

		const headers = call.init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer secret-tok");
		expect(headers["Notion-Version"]).toBe(NOTION_VERSION);
		expect(headers["Content-Type"]).toBe("application/json");

		const parsedBody = JSON.parse(String(call.init?.body)) as {
			query: string;
			start_cursor?: string;
		};
		expect(parsedBody.query).toBe("specs");
		// No cursor passed -> body omits start_cursor.
		expect(parsedBody.start_cursor).toBeUndefined();
	});

	test("forwards start_cursor when provided", async () => {
		let sentBody: { query: string; start_cursor?: string } | undefined;
		const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
			sentBody = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify({ results: [], has_more: false, next_cursor: null }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as FetchImpl;

		await search({ token: "t", startCursor: "cursor-123", fetchImpl });

		expect(sentBody?.start_cursor).toBe("cursor-123");
		// Default query is the empty string (all shared pages).
		expect(sentBody?.query).toBe("");
	});

	test("parses results, has_more, and next_cursor", async () => {
		const fetchImpl = jsonFetch({
			results: [
				{
					id: "page-1",
					url: "https://notion.so/page-1",
					last_edited_time: "2026-01-01T00:00:00.000Z",
					properties: { Name: { type: "title", title: [] } },
					object: "page",
				},
				// Missing-id object is dropped by normalization.
				{ url: "https://notion.so/orphan" },
			],
			has_more: true,
			next_cursor: "next-abc",
		});

		const result = await search({ token: "t", fetchImpl });

		expect(result.results).toHaveLength(1);
		expect(result.results[0]?.id).toBe("page-1");
		expect(result.results[0]?.url).toBe("https://notion.so/page-1");
		expect(result.has_more).toBe(true);
		expect(result.next_cursor).toBe("next-abc");
	});

	test("defaults has_more/next_cursor when absent", async () => {
		const fetchImpl = jsonFetch({ results: [] });
		const result = await search({ token: "t", fetchImpl });

		expect(result.results).toEqual([]);
		expect(result.has_more).toBe(false);
		expect(result.next_cursor).toBeNull();
	});

	test("throws on a non-ok response", async () => {
		const fetchImpl = (async () =>
			new Response("unauthorized", {
				status: 401,
				statusText: "Unauthorized",
			})) as unknown as FetchImpl;

		await expect(search({ token: "bad", fetchImpl })).rejects.toThrow(
			/Notion \/search returned 401/,
		);
	});

	test("throws a clear error on transport failure", async () => {
		const fetchImpl = (async () => {
			throw new Error("socket hang up");
		}) as unknown as FetchImpl;

		await expect(search({ token: "t", fetchImpl })).rejects.toThrow(
			/Notion \/search request failed: socket hang up/,
		);
	});
});

describe("notion-client listBlockChildren", () => {
	test("sends the correct URL, headers, and cursor", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(
				JSON.stringify({ results: [], has_more: false, next_cursor: null }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as FetchImpl;

		await listBlockChildren({
			token: "secret-tok",
			blockId: "page 1",
			startCursor: "cursor-123",
			pageSize: 50,
			fetchImpl,
		});

		expect(calls).toHaveLength(1);
		const call = calls[0];
		expect(call).toBeDefined();
		if (!call) throw new Error("expected a fetch call");

		expect(call.url).toBe(
			`${NOTION_API_BASE}/blocks/page%201/children?page_size=50&start_cursor=cursor-123`,
		);
		expect(call.init?.method).toBe("GET");

		const headers = call.init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer secret-tok");
		expect(headers["Notion-Version"]).toBe(NOTION_VERSION);
	});

	test("normalizes child blocks and pagination", async () => {
		const fetchImpl = jsonFetch({
			results: [
				{
					id: "block-1",
					type: "paragraph",
					has_children: true,
					paragraph: { rich_text: [{ plain_text: "Hello" }] },
				},
				{ type: "paragraph" },
			],
			has_more: true,
			next_cursor: "next-abc",
		});

		const result = await listBlockChildren({
			token: "t",
			blockId: "page-1",
			fetchImpl,
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0]?.id).toBe("block-1");
		expect(result.results[0]?.has_children).toBe(true);
		expect(result.has_more).toBe(true);
		expect(result.next_cursor).toBe("next-abc");
	});

	test("throws on a non-ok response", async () => {
		const fetchImpl = (async () =>
			new Response("forbidden", {
				status: 403,
				statusText: "Forbidden",
			})) as unknown as FetchImpl;

		await expect(
			listBlockChildren({ token: "bad", blockId: "page-1", fetchImpl }),
		).rejects.toThrow(/Notion block children returned 403/);
	});

	test("validates page_size before making a request", async () => {
		const fetchImpl = (async () => {
			throw new Error("fetch should not be called");
		}) as unknown as FetchImpl;

		await expect(
			listBlockChildren({
				token: "t",
				blockId: "page-1",
				pageSize: 0,
				fetchImpl,
			}),
		).rejects.toThrow(/pageSize/);
		await expect(
			listBlockChildren({
				token: "t",
				blockId: "page-1",
				pageSize: 101,
				fetchImpl,
			}),
		).rejects.toThrow(/pageSize/);
	});
});
