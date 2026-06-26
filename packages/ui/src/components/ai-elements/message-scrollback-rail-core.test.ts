import { describe, expect, test } from "bun:test";
import {
	buildOutlinePreview,
	deriveOutlineEntries,
	findActiveOutlineId,
	OUTLINE_PREVIEW_CHARACTER_LIMIT,
	type OutlineSourceMessage,
	pushNavHistory,
	truncateOutlinePreview,
} from "./message-scrollback-rail-core";

const userText = (id: string, text: string): OutlineSourceMessage => ({
	id,
	role: "user",
	parts: [{ type: "text", text }],
});

describe("truncateOutlinePreview", () => {
	test("keeps short text intact", () => {
		expect(truncateOutlinePreview("hello")).toBe("hello");
	});

	test("truncates to the 60-char budget with an ellipsis", () => {
		const long = "x".repeat(120);
		const result = truncateOutlinePreview(long);
		expect(result.length).toBe(OUTLINE_PREVIEW_CHARACTER_LIMIT);
		expect(result.endsWith("...")).toBe(true);
	});
});

describe("buildOutlinePreview", () => {
	test("joins and collapses whitespace across text parts", () => {
		const message: OutlineSourceMessage = {
			id: "m1",
			role: "user",
			parts: [
				{ type: "text", text: "  hello \n world  " },
				{ type: "text", text: "again" },
			],
		};
		expect(buildOutlinePreview(message)).toBe("hello world again");
	});

	test("reads from `content` when `parts` is absent (transcript shape)", () => {
		const message: OutlineSourceMessage = {
			id: "m2",
			role: "user",
			content: [{ type: "text", text: "from content" }],
		};
		expect(buildOutlinePreview(message)).toBe("from content");
	});

	test("falls back to attachment labels for non-text messages", () => {
		const one: OutlineSourceMessage = {
			id: "m3",
			role: "user",
			parts: [{ type: "file" }],
		};
		expect(buildOutlinePreview(one)).toBe("Sent 1 attachment");

		const many: OutlineSourceMessage = {
			id: "m4",
			role: "user",
			parts: [{ type: "image" }, { type: "file" }],
		};
		expect(buildOutlinePreview(many)).toBe("Sent 2 attachments");
	});

	test("respects custom locale labels", () => {
		const message: OutlineSourceMessage = {
			id: "m5",
			role: "user",
			parts: [{ type: "file" }],
		};
		expect(
			buildOutlinePreview(message, {
				attachmentSingular: () => "Отправлено 1 вложение",
				attachmentPlural: (count) => `Отправлено вложений: ${count}`,
				empty: "(пустое сообщение)",
			}),
		).toBe("Отправлено 1 вложение");
	});

	test("returns the empty fallback for messages with no usable content", () => {
		expect(buildOutlinePreview({ id: "m6", role: "user", parts: [] })).toBe(
			"(empty message)",
		);
	});
});

describe("deriveOutlineEntries", () => {
	test("emits one entry per user message and flags the latest", () => {
		const entries = deriveOutlineEntries([
			userText("u1", "first"),
			{ id: "a1", role: "assistant", parts: [{ type: "text", text: "reply" }] },
			userText("u2", "second"),
		]);

		expect(entries).toEqual([
			{ id: "u1", preview: "first", isLatest: false },
			{ id: "u2", preview: "second", isLatest: true },
		]);
	});

	test("ignores assistant and system messages", () => {
		const entries = deriveOutlineEntries([
			{ id: "s1", role: "system", parts: [{ type: "text", text: "sys" }] },
			{ id: "a1", role: "assistant", parts: [{ type: "text", text: "a" }] },
		]);
		expect(entries).toEqual([]);
	});
});

describe("findActiveOutlineId", () => {
	const entries = [
		{ id: "u1", top: 0 },
		{ id: "u2", top: 100 },
		{ id: "u3", top: 200 },
	];

	test("returns the first entry at the top", () => {
		expect(findActiveOutlineId(entries, 0)).toBe("u1");
	});

	test("returns the last entry scrolled past", () => {
		expect(findActiveOutlineId(entries, 150)).toBe("u2");
		expect(findActiveOutlineId(entries, 205)).toBe("u3");
	});

	test("returns null for an empty outline", () => {
		expect(findActiveOutlineId([], 0)).toBeNull();
	});
});

describe("pushNavHistory", () => {
	test("appends new ids", () => {
		expect(pushNavHistory(["a"], "b")).toEqual(["a", "b"]);
	});

	test("de-duplicates the head", () => {
		expect(pushNavHistory(["a", "b"], "b")).toEqual(["a", "b"]);
	});

	test("caps the stack length", () => {
		const stack = Array.from({ length: 50 }, (_, i) => `m${i}`);
		const next = pushNavHistory(stack, "new", 50);
		expect(next.length).toBe(50);
		expect(next[next.length - 1]).toBe("new");
		expect(next[0]).toBe("m1");
	});
});
