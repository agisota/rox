import { describe, expect, test } from "bun:test";
import type { EmailRawInbound } from "@rox/comms-core";
import {
	type IngestOptions,
	ingestInboundMail,
	type MailIngestDb,
} from "./ingest";

type AnyRow = Record<string, unknown>;

interface FakeState {
	address: {
		id: string;
		userId: string;
		organizationId: string;
		status: string;
		graceUntil: Date | null;
	} | null;
	existingMessage: { id: string; threadId: string | null } | null;
	existingThread: { id: string } | null;
	insertedMessages: AnyRow[];
	insertedAttachments: AnyRow[][];
	createdThreads: AnyRow[];
	emitted: AnyRow[];
}

function makeDb(state: FakeState): MailIngestDb {
	let msgSeq = 0;
	let threadSeq = 0;
	return {
		findAddressByValue: async () => state.address,
		findMessageByMsgId: async () => state.existingMessage,
		findThread: async () => state.existingThread,
		createThread: async (args) => {
			state.createdThreads.push(args);
			threadSeq += 1;
			return { id: `thread-${threadSeq}` };
		},
		touchThread: async () => {},
		insertMessage: async (row) => {
			state.insertedMessages.push(row);
			msgSeq += 1;
			return { id: `msg-${msgSeq}` };
		},
		insertAttachments: async (rows) => {
			state.insertedAttachments.push(rows);
		},
		emitToUnifiedInbox: async (args) => {
			state.emitted.push(args);
		},
	};
}

function freshState(over: Partial<FakeState> = {}): FakeState {
	return {
		address: {
			id: "addr-1",
			userId: "user-1",
			organizationId: "org-1",
			status: "active",
			graceUntil: null,
		},
		existingMessage: null,
		existingThread: null,
		insertedMessages: [],
		insertedAttachments: [],
		createdThreads: [],
		emitted: [],
		...over,
	};
}

const CLEAN: EmailRawInbound = {
	rcptTo: "Mark@rox.one",
	mailFrom: "Alice@Example.com",
	fromName: "Alice",
	messageId: "<m1@example.com>",
	inReplyTo: null,
	references: [],
	subject: "Hello",
	to: ["mark@rox.one"],
	cc: [],
	bcc: [],
	replyTo: null,
	rawSize: 1024,
	rawBlobKey: "mail/raw/user-1/m1.eml",
	bodyTextKey: "mail/body/user-1/m1.txt",
	bodyHtmlKey: null,
	snippet: "Hello there",
	auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: true },
	attachments: [
		{
			filename: "a.pdf",
			contentType: "application/pdf",
			sizeBytes: 1024,
			blobKey: "mail/att/user-1/a.pdf",
		},
	],
	hasCalendarInvite: false,
	receivedAt: "2026-06-20T10:00:00.000Z",
};

describe("ingestInboundMail", () => {
	test("accepts clean mail: persists message + attachments, emits to D1", async () => {
		const state = freshState();
		const res = await ingestInboundMail(makeDb(state), CLEAN);
		expect(res.kind).toBe("accepted");
		expect(state.insertedMessages).toHaveLength(1);
		expect(state.insertedMessages[0]?.status).toBe("received");
		expect(state.insertedMessages[0]?.direction).toBe("inbound");
		// Body lives in R2 — only pointers persisted.
		expect(state.insertedMessages[0]?.rawBlobKey).toBe(
			"mail/raw/user-1/m1.eml",
		);
		expect(state.insertedAttachments[0]).toHaveLength(1);
		expect(state.emitted).toHaveLength(1);
	});

	test("returns no_such_handle for an unknown recipient", async () => {
		const state = freshState({ address: null });
		const res = await ingestInboundMail(makeDb(state), CLEAN);
		expect(res.kind).toBe("no_such_handle");
		expect(state.insertedMessages).toHaveLength(0);
	});

	test("returns no_such_handle for a disabled address", async () => {
		const state = freshState({
			address: {
				id: "a",
				userId: "u",
				organizationId: "o",
				status: "disabled",
				graceUntil: null,
			},
		});
		const res = await ingestInboundMail(makeDb(state), CLEAN);
		expect(res.kind).toBe("no_such_handle");
	});

	test("expired grace alias no longer resolves", async () => {
		const state = freshState({
			address: {
				id: "a",
				userId: "u",
				organizationId: "o",
				status: "grace",
				graceUntil: new Date("2020-01-01T00:00:00Z"),
			},
		});
		const opts: IngestOptions = { now: () => new Date("2026-06-20T00:00:00Z") };
		const res = await ingestInboundMail(makeDb(state), CLEAN, opts);
		expect(res.kind).toBe("no_such_handle");
	});

	test("dedups a redelivered Message-ID", async () => {
		const state = freshState({
			existingMessage: { id: "existing-1", threadId: "t-1" },
		});
		const res = await ingestInboundMail(makeDb(state), CLEAN);
		expect(res).toMatchObject({ kind: "duplicate", messageId: "existing-1" });
		expect(state.insertedMessages).toHaveLength(0);
	});

	test("quarantines failed-auth mail and does NOT emit to D1", async () => {
		const state = freshState();
		const res = await ingestInboundMail(makeDb(state), {
			...CLEAN,
			auth: { spf: "fail", dkim: "fail", dmarc: "fail", trusted: true },
		});
		expect(res.kind).toBe("quarantined");
		expect(state.insertedMessages[0]?.status).toBe("quarantined");
		// Quarantined mail is persisted but never surfaced to the unified inbox.
		expect(state.emitted).toHaveLength(0);
	});

	test("forged untrusted pass is quarantined (untrusted ⇒ scored, not clean)", async () => {
		// A sender stamps `Authentication-Results: ...; dmarc=pass` on their own
		// message; without a trusted authserv-id the ingest must NOT treat it as
		// clean. The unknown penalties (15+10+10=35) + spammy (15) + bulk (10)
		// cross the quarantine threshold.
		const state = freshState();
		const res = await ingestInboundMail(makeDb(state), {
			...CLEAN,
			subject: "Free money click here now",
			to: Array.from({ length: 30 }, (_, i) => `user${i}@rox.one`),
			auth: { spf: "pass", dkim: "pass", dmarc: "pass", trusted: false },
		});
		expect(res.kind).toBe("quarantined");
		// The persisted verdict columns must NOT record an untrusted pass as true.
		expect(state.insertedMessages[0]?.spfPass).toBeNull();
		expect(state.insertedMessages[0]?.dkimPass).toBeNull();
		expect(state.insertedMessages[0]?.dmarcPass).toBeNull();
		expect(state.emitted).toHaveLength(0);
	});

	test("threads into an existing thread when one matches", async () => {
		const state = freshState({ existingThread: { id: "existing-thread" } });
		const res = await ingestInboundMail(makeDb(state), CLEAN);
		expect(res).toMatchObject({
			kind: "accepted",
			threadId: "existing-thread",
		});
		expect(state.createdThreads).toHaveLength(0);
	});
});
