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
	enqueueCalls: { originId: string | null }[];
}

const state: FakeState = {
	account: null,
	seenStanzaIds: new Set(),
	emitCalls: 0,
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
	async emitToUnifiedInbox() {
		state.emitCalls += 1;
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

	test("tolerates a stanza with no id (still emits, enqueue originId null)", async () => {
		const { stanzaId: _omit, ...noId } = RAW;
		const res = await ingestInboundXmpp(fakeDb, noId);
		expect(res.kind).toBe("accepted");
		expect(state.emitCalls).toBe(1);
		expect(state.enqueueCalls[0]?.originId).toBeNull();
	});
});
