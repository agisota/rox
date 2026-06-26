import { describe, expect, it } from "bun:test";
import type { InboxItem, InboxSource } from "../types";
import { filterInboxItems, type TriagePredicates } from "./filterItems";

const item = (
	key: string,
	source: InboxSource,
	unread = 0,
	title = key,
): InboxItem => ({
	key,
	source,
	threadId: key,
	title,
	preview: "preview",
	timestamp: new Date(),
	unreadCount: unread,
});

const noTriage: TriagePredicates = {
	isArchived: () => false,
	isSnoozed: () => false,
};

const base = [
	item("chat:1", "chat", 2, "Релиз"),
	item("mail:1", "mail", 0, "Счёт"),
	item("chat:2", "chat", 0, "Дизайн"),
];

describe("filterInboxItems", () => {
	it("All shows every active row", () => {
		const out = filterInboxItems({
			items: base,
			filter: "all",
			status: "all",
			query: "",
			triage: noTriage,
		});
		expect(out.map((i) => i.key)).toEqual(["chat:1", "mail:1", "chat:2"]);
	});

	it("source slice keeps only that source", () => {
		const out = filterInboxItems({
			items: base,
			filter: "chat",
			status: "all",
			query: "",
			triage: noTriage,
		});
		expect(out.map((i) => i.key)).toEqual(["chat:1", "chat:2"]);
	});

	it("unread status drops read rows", () => {
		const out = filterInboxItems({
			items: base,
			filter: "all",
			status: "unread",
			query: "",
			triage: noTriage,
		});
		expect(out.map((i) => i.key)).toEqual(["chat:1"]);
	});

	it("text query matches title", () => {
		const out = filterInboxItems({
			items: base,
			filter: "all",
			status: "all",
			query: "счёт",
			triage: noTriage,
		});
		expect(out.map((i) => i.key)).toEqual(["mail:1"]);
	});

	it("active streams hide archived rows", () => {
		const triage: TriagePredicates = {
			isArchived: (k) => k === "chat:1",
			isSnoozed: () => false,
		};
		const out = filterInboxItems({
			items: base,
			filter: "all",
			status: "all",
			query: "",
			triage,
		});
		expect(out.map((i) => i.key)).toEqual(["mail:1", "chat:2"]);
	});

	it("Архив view shows exactly the archived rows", () => {
		const triage: TriagePredicates = {
			isArchived: (k) => k === "chat:1",
			isSnoozed: () => false,
		};
		const out = filterInboxItems({
			items: base,
			filter: "archive",
			status: "all",
			query: "",
			triage,
		});
		expect(out.map((i) => i.key)).toEqual(["chat:1"]);
	});

	it("Сохранённое view shows exactly the snoozed rows", () => {
		const triage: TriagePredicates = {
			isArchived: () => false,
			isSnoozed: (k) => k === "mail:1",
		};
		const out = filterInboxItems({
			items: base,
			filter: "snoozed",
			status: "all",
			query: "",
			triage,
		});
		expect(out.map((i) => i.key)).toEqual(["mail:1"]);
	});
});
