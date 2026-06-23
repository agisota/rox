import { describe, expect, it } from "bun:test";

import {
	buildMailReplyContext,
	buildReplySubject,
	type MailThread,
	type MailThreadMessage,
} from "./mailReplyContext";

function msg(overrides: Partial<MailThreadMessage>): MailThreadMessage {
	return {
		direction: "inbound",
		fromAddr: "sender@example.com",
		toAddrs: ["me@rox.one"],
		subject: "Hello",
		rfcMessageId: "<m1@example.com>",
		referencesIds: null,
		...overrides,
	} as MailThreadMessage;
}

describe("buildReplySubject", () => {
	it("adds a Re: prefix", () => {
		expect(buildReplySubject("Hello")).toBe("Re: Hello");
	});

	it("collapses repeated Re: prefixes", () => {
		expect(buildReplySubject("Re: Re: Hello")).toBe("Re: Hello");
	});

	it("handles empty subjects", () => {
		expect(buildReplySubject(null)).toBe("Re:");
		expect(buildReplySubject("   ")).toBe("Re:");
	});
});

describe("buildMailReplyContext", () => {
	const thread = { subjectNorm: "Hello" } as MailThread;

	it("targets the most recent inbound sender", () => {
		const ctx = buildMailReplyContext(thread, [
			msg({
				direction: "inbound",
				fromAddr: "first@example.com",
				rfcMessageId: "<a@x>",
			}),
			msg({
				direction: "outbound",
				fromAddr: "me@rox.one",
				rfcMessageId: "<b@x>",
			}),
			msg({
				direction: "inbound",
				fromAddr: "latest@example.com",
				rfcMessageId: "<c@x>",
			}),
		]);
		expect(ctx.to).toBe("latest@example.com");
		expect(ctx.inReplyTo).toBe("<c@x>");
		expect(ctx.references).toEqual(["<a@x>", "<b@x>", "<c@x>"]);
		expect(ctx.subject).toBe("Re: Hello");
	});

	it("falls back to recipient for all-outbound threads", () => {
		const ctx = buildMailReplyContext(thread, [
			msg({
				direction: "outbound",
				fromAddr: "me@rox.one",
				toAddrs: ["dest@example.com"],
				rfcMessageId: "<o@x>",
			}),
		]);
		expect(ctx.to).toBe("dest@example.com");
		expect(ctx.inReplyTo).toBe("<o@x>");
	});

	it("dedupes the references chain and preserves order", () => {
		const ctx = buildMailReplyContext(thread, [
			msg({ rfcMessageId: "<a@x>", referencesIds: ["<root@x>"] }),
			msg({ rfcMessageId: "<b@x>", referencesIds: ["<root@x>", "<a@x>"] }),
		]);
		expect(ctx.references).toEqual(["<root@x>", "<a@x>", "<b@x>"]);
	});

	it("returns empty defaults for an empty thread", () => {
		const ctx = buildMailReplyContext(null, []);
		expect(ctx.to).toBe("");
		expect(ctx.inReplyTo).toBeNull();
		expect(ctx.references).toEqual([]);
		expect(ctx.subject).toBe("Re:");
	});
});
