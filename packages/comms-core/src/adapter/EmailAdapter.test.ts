import { describe, expect, test } from "bun:test";
import type { OutboundDraft } from "../types";
import {
	EmailAdapter,
	type EmailOutboundPayload,
	type EmailRawInbound,
	normalizeSubject,
} from "./EmailAdapter";
import type { SendContext } from "./TransportAdapter";

function makeAdapter(captured: EmailOutboundPayload[]) {
	return new EmailAdapter({
		send: async (payload) => {
			captured.push(payload);
			return { id: "resend-evt-1" };
		},
		resolveFromAddress: async (userId) =>
			userId === "user-1" ? "mark@rox.one" : null,
	});
}

const RAW: EmailRawInbound = {
	rcptTo: "Mark@rox.one",
	mailFrom: "Alice@Example.com",
	fromName: "Alice",
	messageId: "<msg-1@example.com>",
	inReplyTo: "<root@example.com>",
	references: ["<root@example.com>"],
	subject: "Re: Hello",
	to: ["Mark@rox.one"],
	cc: ["bob@example.com"],
	bcc: [],
	replyTo: "alice-reply@example.com",
	rawSize: 2048,
	rawBlobKey: "mail/raw/user-1/abc.eml",
	bodyTextKey: "mail/body/user-1/abc.txt",
	bodyHtmlKey: null,
	snippet: "Hello there, thanks for...",
	auth: { spf: true, dkim: true, dmarc: true },
	attachments: [
		{
			filename: "a.pdf",
			contentType: "application/pdf",
			sizeBytes: 1024,
			contentId: null,
			isInline: false,
			blobKey: "mail/att/user-1/a.pdf",
		},
	],
	hasCalendarInvite: false,
	receivedAt: "2026-06-20T10:00:00.000Z",
};

describe("EmailAdapter.normalizeInbound", () => {
	test("maps the envelope into the hub-neutral shape (transport=email)", () => {
		const adapter = makeAdapter([]);
		const n = adapter.normalizeInbound(RAW);
		expect(n.transport).toBe("email");
		// externalId is the RFC Message-ID (for (email, Message-ID) dedup).
		expect(n.externalId).toBe("<msg-1@example.com>");
		expect(n.inReplyToExternalId).toBe("<root@example.com>");
	});

	test("lowercases from + to addresses", () => {
		const adapter = makeAdapter([]);
		const n = adapter.normalizeInbound(RAW);
		expect(n.from).toBe("alice@example.com");
		expect(n.to).toEqual(["mark@rox.one"]);
	});

	test("keeps the body out of the row (snippet only, R2 pointers in metadata)", () => {
		const adapter = makeAdapter([]);
		const n = adapter.normalizeInbound(RAW);
		expect(n.body).toBe("Hello there, thanks for...");
		expect(n.bodyHtml).toBeNull();
		expect(n.metadata.rawBlobKey).toBe("mail/raw/user-1/abc.eml");
		expect(n.metadata.bodyTextKey).toBe("mail/body/user-1/abc.txt");
		expect(n.metadata.provider).toBe("cloudflare");
		expect(n.metadata.subjectNorm).toBe("hello");
	});

	test("maps attachments to pointers (url = R2 key, no inline bytes)", () => {
		const adapter = makeAdapter([]);
		const n = adapter.normalizeInbound(RAW);
		expect(n.attachments).toHaveLength(1);
		expect(n.attachments[0]?.url).toBe("mail/att/user-1/a.pdf");
		expect(n.metadata.hasAttachments).toBe(true);
	});

	test("carries the auth verdicts through for API-side spam scoring", () => {
		const adapter = makeAdapter([]);
		const n = adapter.normalizeInbound({
			...RAW,
			auth: { spf: false, dkim: false, dmarc: false },
		});
		expect(n.metadata.auth).toEqual({ spf: false, dkim: false, dmarc: false });
	});
});

describe("EmailAdapter.send", () => {
	const ctx: SendContext = {
		toAddress: "alice@example.com",
		delivery: { id: "d-1", messageId: "m-1", transport: "email" },
	};

	test("sends From <handle>@rox.one via the injected transport", async () => {
		const captured: EmailOutboundPayload[] = [];
		const adapter = makeAdapter(captured);
		const draft: OutboundDraft = {
			organizationId: "org-1",
			authorUserId: "user-1",
			recipients: [{ kind: "address", address: "alice@example.com" }],
			subject: "Hi",
			body: "Body text",
		};
		const res = await adapter.send(draft, ctx);
		expect(res.providerId).toBe("resend-evt-1");
		expect(captured).toHaveLength(1);
		expect(captured[0]?.from).toBe("mark@rox.one");
		expect(captured[0]?.to).toEqual(["alice@example.com"]);
		expect(captured[0]?.subject).toBe("Hi");
		expect(captured[0]?.text).toBe("Body text");
	});

	test("sets In-Reply-To / References threading headers on a reply", async () => {
		const captured: EmailOutboundPayload[] = [];
		const adapter = makeAdapter(captured);
		const draft: OutboundDraft = {
			organizationId: "org-1",
			authorUserId: "user-1",
			recipients: [{ kind: "address", address: "alice@example.com" }],
			subject: "Re: Hi",
			body: "Reply body",
			metadata: {
				inReplyTo: "<msg-1@example.com>",
				references: ["<root@example.com>", "<msg-1@example.com>"],
			},
		};
		await adapter.send(draft, ctx);
		expect(captured[0]?.headers?.["In-Reply-To"]).toBe("<msg-1@example.com>");
		expect(captured[0]?.headers?.References).toBe(
			"<root@example.com> <msg-1@example.com>",
		);
	});

	test("falls back to no-reply when no handle resolves", async () => {
		const captured: EmailOutboundPayload[] = [];
		const adapter = makeAdapter(captured);
		const draft: OutboundDraft = {
			organizationId: "org-1",
			authorUserId: "unknown-user",
			recipients: [{ kind: "address", address: "alice@example.com" }],
			subject: "Hi",
			body: "Body",
		};
		await adapter.send(draft, ctx);
		expect(captured[0]?.from).toBe("no-reply@rox.one");
	});
});

describe("normalizeSubject", () => {
	test("strips re:/fwd: prefixes and lowercases", () => {
		expect(normalizeSubject("Re: Fwd: Hello World")).toBe("hello world");
		expect(normalizeSubject("FW: Status")).toBe("status");
		expect(normalizeSubject(null)).toBe("");
	});
});
