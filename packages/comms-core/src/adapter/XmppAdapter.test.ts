import { describe, expect, test } from "bun:test";
import type { OutboundDraft } from "../types";
import type { SendContext } from "./TransportAdapter";
import {
	XmppAdapter,
	type XmppOutboundPayload,
	type XmppRawInbound,
} from "./XmppAdapter";

function makeAdapter(
	over: Partial<ConstructorParameters<typeof XmppAdapter>[0]> = {},
) {
	const sent: XmppOutboundPayload[] = [];
	const adapter = new XmppAdapter({
		send: async (payload) => {
			sent.push(payload);
			return { id: payload.originId };
		},
		mintOriginId: () => "origin-fixed",
		...over,
	});
	return { adapter, sent };
}

const CTX: SendContext = {
	toAddress: "bob@external.org",
	delivery: { id: "d1", messageId: "m1", transport: "xmpp" },
};

describe("XmppAdapter.kind", () => {
	test("discriminates as xmpp", () => {
		const { adapter } = makeAdapter();
		expect(adapter.kind).toBe("xmpp");
	});
});

describe("XmppAdapter.normalizeInbound", () => {
	test("maps a bridge <message> event into the hub shape (transport=xmpp)", () => {
		const { adapter } = makeAdapter();
		const raw: XmppRawInbound = {
			from: "bob@external.org/Conversations",
			to: "alice@xmpp.rox.one",
			body: "hello from jabber",
			stanzaId: "stanza-7",
			thread: "thread-9",
			subject: "hi",
			stanzaType: "chat",
			sentAt: "2026-06-21T10:00:00.000Z",
		};
		const msg = adapter.normalizeInbound(raw);

		expect(msg.transport).toBe("xmpp");
		expect(msg.externalId).toBe("stanza-7");
		// Resource is stripped: a full JID threads with the bare contact.
		expect(msg.from).toBe("bob@external.org");
		expect(msg.to).toEqual(["alice@xmpp.rox.one"]);
		expect(msg.body).toBe("hello from jabber");
		expect(msg.subject).toBe("hi");
		expect(msg.createdAt.toISOString()).toBe("2026-06-21T10:00:00.000Z");
		expect(msg.metadata.thread).toBe("thread-9");
		expect(msg.metadata.fromJid).toBe("bob@external.org");
	});

	test("carries reply threading + tolerates a missing stanza id", () => {
		const { adapter } = makeAdapter();
		const msg = adapter.normalizeInbound({
			from: "BOB@External.ORG",
			to: "alice@xmpp.rox.one",
			body: "re: hi",
			replyToStanzaId: "stanza-7",
		});
		expect(msg.externalId).toBeNull();
		expect(msg.inReplyToExternalId).toBe("stanza-7");
		// JIDs lowercased.
		expect(msg.from).toBe("bob@external.org");
	});
});

describe("XmppAdapter.send", () => {
	const draft: OutboundDraft = {
		organizationId: "org-1",
		authorUserId: "user-1",
		recipients: [{ kind: "address", address: "bob@external.org" }],
		body: "reply from rox",
	};

	test("builds a chat stanza From the author's bound JID", async () => {
		const { adapter, sent } = makeAdapter({
			resolveFromHandle: async () => "alice",
		});
		const res = await adapter.send(draft, CTX);

		expect(sent).toHaveLength(1);
		const payload = sent[0];
		expect(payload?.from).toBe("alice@xmpp.rox.one");
		expect(payload?.to).toBe("bob@external.org");
		expect(payload?.type).toBe("chat");
		expect(payload?.body).toBe("reply from rox");
		expect(payload?.originId).toBe("origin-fixed");
		expect(res.providerId).toBe("origin-fixed");
	});

	test("respects a domain override for the From JID", async () => {
		const { adapter, sent } = makeAdapter({
			domain: "xmpp.example.org",
			resolveFromHandle: async () => "alice",
		});
		await adapter.send(draft, CTX);
		expect(sent[0]?.from).toBe("alice@xmpp.example.org");
	});

	test("falls back to metadata.fromJid then a bridge JID", async () => {
		const { adapter: a1, sent: s1 } = makeAdapter();
		await a1.send(
			{ ...draft, metadata: { fromJid: "carol@xmpp.rox.one" } },
			CTX,
		);
		expect(s1[0]?.from).toBe("carol@xmpp.rox.one");

		const { adapter: a2, sent: s2 } = makeAdapter();
		await a2.send(draft, CTX);
		expect(s2[0]?.from).toBe("bridge@xmpp.rox.one");
	});

	test("propagates thread + reply ids from draft metadata", async () => {
		const { adapter, sent } = makeAdapter({
			resolveFromHandle: async () => "alice",
		});
		await adapter.send(
			{ ...draft, metadata: { thread: "t-1", replyToStanzaId: "s-1" } },
			CTX,
		);
		expect(sent[0]?.thread).toBe("t-1");
		expect(sent[0]?.replyToStanzaId).toBe("s-1");
	});

	test("strips a resource off the recipient JID", async () => {
		const { adapter, sent } = makeAdapter({
			resolveFromHandle: async () => "alice",
		});
		await adapter.send(draft, {
			...CTX,
			toAddress: "bob@external.org/Phone",
		});
		expect(sent[0]?.to).toBe("bob@external.org");
	});

	test("uses the bridge-echoed id as the provider id when present", async () => {
		const { adapter } = makeAdapter({
			resolveFromHandle: async () => "alice",
			send: async () => ({ id: "bridge-routed-id" }),
		});
		const res = await adapter.send(draft, CTX);
		expect(res.providerId).toBe("bridge-routed-id");
	});
});
