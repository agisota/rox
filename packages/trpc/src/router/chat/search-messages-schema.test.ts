import { describe, expect, test } from "bun:test";
import {
	SEARCH_MESSAGES_DEFAULT_LIMIT,
	SEARCH_MESSAGES_MAX_LIMIT,
	searchMessagesSchema,
} from "./search-messages-schema";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("searchMessagesSchema", () => {
	test("defaults the limit when omitted", () => {
		const parsed = searchMessagesSchema.parse({ query: "deploy" });
		expect(parsed.limit).toBe(SEARCH_MESSAGES_DEFAULT_LIMIT);
		expect(parsed.sessionId).toBeUndefined();
	});

	test("accepts an optional session scope", () => {
		const parsed = searchMessagesSchema.parse({
			query: "deploy",
			sessionId: SESSION_ID,
		});
		expect(parsed.sessionId).toBe(SESSION_ID);
	});

	test("rejects an empty query", () => {
		expect(() => searchMessagesSchema.parse({ query: "" })).toThrow();
		expect(() => searchMessagesSchema.parse({ query: "   " })).toThrow();
	});

	test("rejects a query over the max length", () => {
		expect(() =>
			searchMessagesSchema.parse({ query: "x".repeat(201) }),
		).toThrow();
	});

	test("rejects a limit above the hard cap", () => {
		expect(() =>
			searchMessagesSchema.parse({
				query: "x",
				limit: SEARCH_MESSAGES_MAX_LIMIT + 1,
			}),
		).toThrow();
	});

	test("rejects a non-uuid session id", () => {
		expect(() =>
			searchMessagesSchema.parse({ query: "x", sessionId: "nope" }),
		).toThrow();
	});
});
