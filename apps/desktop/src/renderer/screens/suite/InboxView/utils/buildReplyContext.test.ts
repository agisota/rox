import { describe, expect, it } from "bun:test";
import {
	buildReplyContext,
	buildReplySubject,
	type ReplySourceMessage,
} from "./buildReplyContext";

const inbound: ReplySourceMessage = {
	direction: "inbound",
	fromAddr: "alice@example.com",
	toAddrs: ["me@rox.one"],
	ccAddrs: ["bob@example.com", "me@rox.one"],
	subject: "Project update",
	rfcMessageId: "<msg-1@example.com>",
	inReplyTo: null,
	referencesIds: null,
};

describe("buildReplySubject", () => {
	it("prefixes Re: for a fresh subject", () => {
		expect(buildReplySubject("Hello")).toBe("Re: Hello");
	});
	it("does not double-prefix an existing Re:", () => {
		expect(buildReplySubject("Re: Hello")).toBe("Re: Hello");
		expect(buildReplySubject("RE: Hello")).toBe("RE: Hello");
	});
	it("falls back to bare Re: for empty/null subject", () => {
		expect(buildReplySubject(null)).toBe("Re:");
		expect(buildReplySubject("   ")).toBe("Re:");
	});
});

describe("buildReplyContext", () => {
	it("returns null for an empty thread", () => {
		expect(buildReplyContext([], "me@rox.one")).toBeNull();
	});

	it("replies to the inbound sender and carries CC (self excluded)", () => {
		const ctx = buildReplyContext([inbound], "me@rox.one");
		expect(ctx).not.toBeNull();
		expect(ctx?.to).toEqual(["alice@example.com"]);
		expect(ctx?.cc).toEqual(["bob@example.com"]);
		expect(ctx?.subject).toBe("Re: Project update");
		expect(ctx?.inReplyTo).toBe("<msg-1@example.com>");
		expect(ctx?.references).toEqual(["<msg-1@example.com>"]);
	});

	it("replies to the newest message in the thread", () => {
		const second: ReplySourceMessage = {
			direction: "inbound",
			fromAddr: "carol@example.com",
			toAddrs: ["me@rox.one"],
			ccAddrs: [],
			subject: "Re: Project update",
			rfcMessageId: "<msg-2@example.com>",
			referencesIds: ["<msg-1@example.com>"],
		};
		const ctx = buildReplyContext([inbound, second], "me@rox.one");
		expect(ctx?.to).toEqual(["carol@example.com"]);
		expect(ctx?.inReplyTo).toBe("<msg-2@example.com>");
		expect(ctx?.references).toEqual([
			"<msg-1@example.com>",
			"<msg-2@example.com>",
		]);
		// Subject already has Re: → not doubled.
		expect(ctx?.subject).toBe("Re: Project update");
	});

	it("for our own outbound message replies to the original recipients", () => {
		const outbound: ReplySourceMessage = {
			direction: "outbound",
			fromAddr: "me@rox.one",
			toAddrs: ["alice@example.com", "me@rox.one"],
			ccAddrs: [],
			subject: "Greetings",
			rfcMessageId: "<out-1@rox.one>",
			referencesIds: null,
		};
		const ctx = buildReplyContext([outbound], "me@rox.one");
		expect(ctx?.to).toEqual(["alice@example.com"]);
		expect(ctx?.subject).toBe("Re: Greetings");
	});

	it("returns null when the only recipient would be self", () => {
		const selfOnly: ReplySourceMessage = {
			direction: "outbound",
			fromAddr: "me@rox.one",
			toAddrs: ["me@rox.one"],
			ccAddrs: [],
			subject: "Note to self",
			rfcMessageId: "<self-1@rox.one>",
			referencesIds: null,
		};
		expect(buildReplyContext([selfOnly], "me@rox.one")).toBeNull();
	});

	it("dedupes recipients case-insensitively", () => {
		const dup: ReplySourceMessage = {
			direction: "inbound",
			fromAddr: "Alice@Example.com",
			toAddrs: ["me@rox.one"],
			ccAddrs: ["ALICE@example.com", "bob@example.com"],
			subject: "Hi",
			rfcMessageId: "<d-1@example.com>",
			referencesIds: null,
		};
		const ctx = buildReplyContext([dup], "me@rox.one");
		expect(ctx?.to).toEqual(["Alice@Example.com"]);
		// alice already a primary recipient → excluded from cc.
		expect(ctx?.cc).toEqual(["bob@example.com"]);
	});
});
