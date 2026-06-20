import { beforeEach, describe, expect, test } from "bun:test";
import type { XmppRawInbound } from "@rox/comms-core";
import {
	ingestInboundXmpp,
	type ResolvedJidAccount,
	type XmppIngestDb,
} from "./ingest";

// --- In-memory fake db -------------------------------------------------------

interface FakeState {
	account: ResolvedJidAccount | null;
	seenStanzaIds: Set<string>;
	emitCalls: number;
	emittedExternalIds: (string | null)[];
	enqueueCalls: { originId: string | null }[];
}

const state: FakeState = {
	account: null,
	seenStanzaIds: new Set(),
	emitCalls: 0,
	emittedExternalIds: [],
	enqueueCalls: [],
};

const fakeDb: XmppIngestDb = {
	async resolveAccountByJid({ localpart }) {
		// The fixture binds "alice"; anything else is unknown.
		return localpart === "alice" ? state.account : null;
	},
	async findMessageByStanzaId(stanzaId) {
		return state.seenStanzaIds.has(stanzaId) ? { id: `msg-${stanzaId}` } : null;
	},
	async emitToUnifiedInbox({ stanzaId }) {
		state.emitCalls += 1;
		state.emittedExternalIds.push(stanzaId);
		// Model the real (xmpp, external_id) idempotency gate: a row now exists
		// for this id, so a later redelivery is caught by findMessageByStanzaId.
		if (stanzaId) state.seenStanzaIds.add(stanzaId);
		return { messageId: "comms-msg-1", threadId: "comms-thread-1" };
	},
	async enqueueOffline({ originId }) {
		state.enqueueCalls.push({ originId });
	},
};

const ACCOUNT: ResolvedJidAccount = {
	accountId: "acct-1",
	userId: "user-1",
	organizationId: "org-1",
};

const RAW: XmppRawInbound = {
	from: "bob@external.org/Conversations",
	to: "alice@xmpp.rox.one",
	body: "hello from jabber",
	stanzaId: "stanza-1",
	thread: "thread-9",
};

beforeEach(() => {
	state.account = ACCOUNT;
	state.seenStanzaIds = new Set();
	state.emitCalls = 0;
	state.emittedExternalIds = [];
	state.enqueueCalls = [];
});

describe("ingestInboundXmpp", () => {
	test("accepted: emits to the D1 inbox + buffers offline", async () => {
		const res = await ingestInboundXmpp(fakeDb, RAW);
		expect(res.kind).toBe("accepted");
		if (res.kind === "accepted") {
			expect(res.messageId).toBe("comms-msg-1");
			expect(res.threadId).toBe("comms-thread-1");
		}
		expect(state.emitCalls).toBe(1);
		expect(state.enqueueCalls).toHaveLength(1);
		expect(state.enqueueCalls[0]?.originId).toBe("stanza-1");
	});

	test("duplicate: a redelivered stanza is a no-op (no emit/enqueue)", async () => {
		state.seenStanzaIds.add("stanza-1");
		const res = await ingestInboundXmpp(fakeDb, RAW);
		expect(res.kind).toBe("duplicate");
		if (res.kind === "duplicate") expect(res.stanzaId).toBe("stanza-1");
		expect(state.emitCalls).toBe(0);
		expect(state.enqueueCalls).toHaveLength(0);
	});

	test("no_such_jid: unknown recipient is rejected before any write", async () => {
		const res = await ingestInboundXmpp(fakeDb, {
			...RAW,
			to: "nobody@xmpp.rox.one",
		});
		expect(res.kind).toBe("no_such_jid");
		expect(state.emitCalls).toBe(0);
	});

	test("no_such_jid when the account row is absent (suspended/missing)", async () => {
		state.account = null;
		const res = await ingestInboundXmpp(fakeDb, RAW);
		expect(res.kind).toBe("no_such_jid");
	});

	test("derives a deterministic dedup id when the stanza has no origin id", async () => {
		const { stanzaId: _omit, ...noId } = RAW;
		const res = await ingestInboundXmpp(fakeDb, noId);
		expect(res.kind).toBe("accepted");
		expect(state.emitCalls).toBe(1);
		// No origin id from the sender => a derived, non-null dedup id is used for
		// both the inbox row (externalId) and the offline-queue originId.
		const originId = state.enqueueCalls[0]?.originId;
		expect(originId).toMatch(/^xmpp-derived:/);
		expect(state.emittedExternalIds[0]).toBe(originId);
	});

	test("redelivery WITHOUT an origin id does not create a second inbox row", async () => {
		const { stanzaId: _omit, ...rest } = RAW;
		// A real s2s redelivery carries the original delay/receive time (XEP-0203),
		// so `sentAt` is stable across the two deliveries of the SAME message.
		const noId = { ...rest, sentAt: 1_699_000_000_000 };

		const first = await ingestInboundXmpp(fakeDb, noId);
		expect(first.kind).toBe("accepted");
		expect(state.emitCalls).toBe(1);
		expect(state.enqueueCalls).toHaveLength(1);

		// Same id-less stanza redelivered (identical stable fields) => no-op.
		const second = await ingestInboundXmpp(fakeDb, noId);
		expect(second.kind).toBe("duplicate");
		expect(state.emitCalls).toBe(1);
		expect(state.enqueueCalls).toHaveLength(1);
	});

	test("distinct id-less messages are NOT collapsed by the derived dedup id", async () => {
		const { stanzaId: _omit, ...base } = RAW;
		const first = await ingestInboundXmpp(fakeDb, base);
		expect(first.kind).toBe("accepted");

		// A genuinely different message (different body + timestamp) gets a
		// different derived id, so it is accepted, not deduped.
		const second = await ingestInboundXmpp(fakeDb, {
			...base,
			body: "a completely different message",
			sentAt: 1_700_000_000_000,
		});
		expect(second.kind).toBe("accepted");
		expect(state.emitCalls).toBe(2);
		expect(state.emittedExternalIds[0]).not.toBe(state.emittedExternalIds[1]);
	});
});
