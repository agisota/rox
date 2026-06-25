import { describe, expect, test } from "bun:test";
import { deriveMailCounts } from "./mailCounts";
import type { MailThreadSummary } from "./mailTypes";

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

describe("deriveMailCounts (server-backed FN-135)", () => {
	test("counts folders, unread, flagged, attachments from server fields", () => {
		const threads = [
			thread({ id: "a", folder: "inbox", unreadCount: 1 }),
			thread({
				id: "b",
				folder: "inbox",
				unreadCount: 0,
				hasAttachments: true,
			}),
			thread({ id: "c", folder: "archive", isFlagged: true }),
			thread({ id: "d", folder: "spam" }),
			thread({ id: "e", folder: "trash", isFlagged: true }),
			thread({ id: "f", folder: "inbox", isFlagged: true, unreadCount: 3 }),
		];
		const counts = deriveMailCounts({ threads, draftCount: 2, sentCount: 5 });

		expect(counts.byFolder.inbox).toBe(3); // a, b, f
		expect(counts.byFolder.archive).toBe(1);
		expect(counts.byFolder.spam).toBe(1);
		expect(counts.byFolder.trash).toBe(1);
		expect(counts.byFolder.drafts).toBe(2);
		expect(counts.byFolder.sent).toBe(5);
		// Unread inbox threads: a + f.
		expect(counts.byFolder.unread).toBe(2);
		expect(counts.totalUnread).toBe(2);
		// Flagged excludes trash/spam → only c (archive) + f (inbox).
		expect(counts.byFolder.flagged).toBe(2);
		// Attachments in active folders → only b.
		expect(counts.byFolder.attachments).toBe(1);
		expect(counts.total).toBe(6);
	});

	test("empty mailbox yields zeroes", () => {
		const counts = deriveMailCounts({ threads: [], draftCount: 0 });
		expect(counts.total).toBe(0);
		expect(counts.totalUnread).toBe(0);
		expect(counts.byFolder.inbox).toBe(0);
		expect(counts.byFolder.sent).toBe(0);
	});
});
