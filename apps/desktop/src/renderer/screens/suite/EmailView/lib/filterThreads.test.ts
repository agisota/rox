import { describe, expect, test } from "bun:test";
import { filterThreads } from "./filterThreads";
import type { MailThreadSummary } from "./mailTypes";

/** Build a minimal enriched thread row (FN-135 shape). */
function thread(over: Partial<MailThreadSummary>): MailThreadSummary {
	return {
		id: "t",
		organizationId: "org-1",
		ownerUserId: "user-1",
		rootMessageRef: null,
		subjectNorm: "subj",
		lastMessageAt: new Date(),
		messageCount: 1,
		folder: "inbox",
		isFlagged: false,
		createdAt: new Date(),
		unreadCount: 0,
		hasAttachments: false,
		...over,
	} as MailThreadSummary;
}

describe("filterThreads (server-backed FN-135)", () => {
	const rows = [
		thread({ id: "in", folder: "inbox", unreadCount: 2 }),
		thread({ id: "arch", folder: "archive" }),
		thread({ id: "spam", folder: "spam", isFlagged: true }),
		thread({ id: "trash", folder: "trash", isFlagged: true }),
		thread({ id: "flag", folder: "inbox", isFlagged: true }),
		thread({ id: "att", folder: "inbox", hasAttachments: true }),
		thread({ id: "read", folder: "inbox", unreadCount: 0 }),
	];

	test("inbox shows only folder=inbox", () => {
		expect(filterThreads(rows, "inbox").map((t) => t.id)).toEqual([
			"in",
			"flag",
			"att",
			"read",
		]);
	});

	test("archive / spam / trash resolve to their folder", () => {
		expect(filterThreads(rows, "archive").map((t) => t.id)).toEqual(["arch"]);
		expect(filterThreads(rows, "spam").map((t) => t.id)).toEqual(["spam"]);
		expect(filterThreads(rows, "trash").map((t) => t.id)).toEqual(["trash"]);
	});

	test("flagged excludes trash/spam even when flagged there", () => {
		expect(filterThreads(rows, "flagged").map((t) => t.id)).toEqual(["flag"]);
	});

	test("unread = inbox threads with unreadCount > 0", () => {
		expect(filterThreads(rows, "unread").map((t) => t.id)).toEqual(["in"]);
	});

	test("attachments = inbox-ish threads with hasAttachments", () => {
		expect(filterThreads(rows, "attachments").map((t) => t.id)).toEqual([
			"att",
		]);
	});

	test("sent / drafts are served elsewhere → empty here", () => {
		expect(filterThreads(rows, "sent")).toEqual([]);
		expect(filterThreads(rows, "drafts")).toEqual([]);
	});
});
