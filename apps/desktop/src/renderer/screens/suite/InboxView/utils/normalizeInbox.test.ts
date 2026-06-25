import { describe, expect, it } from "bun:test";
import type { InboxItem } from "../types";
import {
	type ChatThreadRow,
	type MailThreadRow,
	mergeInboxItems,
	normalizeChatThread,
	normalizeMailThread,
} from "./normalizeInbox";

const chat = (over: Partial<ChatThreadRow> = {}): ChatThreadRow => ({
	id: "c1",
	subject: "Релиз",
	lastMessageAt: new Date("2026-06-24T10:00:00Z"),
	unreadCount: 0,
	...over,
});

const mail = (over: Partial<MailThreadRow> = {}): MailThreadRow => ({
	id: "m1",
	subjectNorm: "Счёт",
	lastMessageAt: new Date("2026-06-24T09:00:00Z"),
	messageCount: 2,
	...over,
});

describe("normalizeChatThread", () => {
	it("keys by source+id and carries unread count", () => {
		const item = normalizeChatThread(chat({ id: "abc", unreadCount: 3 }));
		expect(item.key).toBe("chat:abc");
		expect(item.source).toBe("chat");
		expect(item.unreadCount).toBe(3);
		expect(item.preview).toBe("3 непрочитанных");
	});

	it("falls back to a derived title when subject is null", () => {
		const item = normalizeChatThread(chat({ id: "deadbeef99", subject: null }));
		expect(item.title).toBe("Тред deadbeef");
	});
});

describe("normalizeMailThread", () => {
	it("keys by source+id and uses subjectNorm", () => {
		const item = normalizeMailThread(mail({ id: "x", subjectNorm: "Привет" }));
		expect(item.key).toBe("mail:x");
		expect(item.title).toBe("Привет");
		expect(item.preview).toBe("2 сообщ.");
	});

	it("renders (без темы) for an empty subject", () => {
		const item = normalizeMailThread(mail({ subjectNorm: "  " }));
		expect(item.title).toBe("(без темы)");
	});
});

describe("mergeInboxItems", () => {
	it("merges and sorts newest-first across transports", () => {
		const items = mergeInboxItems(
			[chat({ id: "old", lastMessageAt: new Date("2026-06-20T00:00:00Z") })],
			[mail({ id: "new", lastMessageAt: new Date("2026-06-24T00:00:00Z") })],
		);
		expect(items.map((i) => i.key)).toEqual(["mail:new", "chat:old"]);
	});

	it("dedupes by key (same transport+id collapses to one row)", () => {
		const items = mergeInboxItems(
			[chat({ id: "dup" }), chat({ id: "dup", unreadCount: 9 })],
			[],
		);
		expect(items).toHaveLength(1);
		expect(items[0]?.unreadCount).toBe(9);
	});

	it("sorts rows with a null timestamp last", () => {
		const items = mergeInboxItems(
			[chat({ id: "null-ts", lastMessageAt: null })],
			[mail({ id: "dated", lastMessageAt: new Date("2026-06-24T00:00:00Z") })],
		);
		expect(items.map((i) => i.key)).toEqual(["mail:dated", "chat:null-ts"]);
	});

	it("folds pre-normalized system rows into the unified stream", () => {
		const system: InboxItem[] = [
			{
				key: "system:pr:1",
				source: "system",
				threadId: "pr:1",
				title: "PR #1",
				preview: "Ожидает ревью",
				timestamp: new Date("2026-06-24T12:00:00Z"),
				unreadCount: 1,
				systemAction: { kind: "open-pr", url: "https://example.test/pr/1" },
			},
		];
		const items = mergeInboxItems(
			[chat({ id: "c", lastMessageAt: new Date("2026-06-24T01:00:00Z") })],
			[mail({ id: "m", lastMessageAt: new Date("2026-06-24T02:00:00Z") })],
			system,
		);
		expect(items.map((i) => i.key)).toEqual([
			"system:pr:1",
			"mail:m",
			"chat:c",
		]);
		expect(items[0]?.systemAction).toEqual({
			kind: "open-pr",
			url: "https://example.test/pr/1",
		});
	});

	it("defaults the system arg to empty (chat+mail only)", () => {
		const items = mergeInboxItems([chat({ id: "c" })], [mail({ id: "m" })]);
		expect(items).toHaveLength(2);
	});
});
