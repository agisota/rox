import { beforeEach, describe, expect, test } from "bun:test";
import type { MeshRawInbound } from "@rox/comms-core";
import {
	ingestInboundMesh,
	type MeshIngestDb,
	type ResolvedDevice,
} from "./ingest";

const ALICE_PUB = "a".repeat(64); // recipient (rox user)
const BOB_PUB = "b".repeat(64); // sender (known rox contact)
const STRANGER_PUB = "c".repeat(64); // unknown sender

interface FakeState {
	knownPubkeys: Map<string, ResolvedDevice>;
	seenEventIds: Set<string>;
	emitCalls: number;
	emittedEventIds: (string | null)[];
	deliveryCalls: { idempotencyKey: string }[];
}

const state: FakeState = {
	knownPubkeys: new Map(),
	seenEventIds: new Set(),
	emitCalls: 0,
	emittedEventIds: [],
	deliveryCalls: [],
};

const fakeDb: MeshIngestDb = {
	async resolveDeviceByPubkey({ nostrPubkey }) {
		return state.knownPubkeys.get(nostrPubkey) ?? null;
	},
	async findMessageByEventId(eventId) {
		return state.seenEventIds.has(eventId) ? { id: `msg-${eventId}` } : null;
	},
	async emitToUnifiedInbox({ eventId }) {
		state.emitCalls += 1;
		state.emittedEventIds.push(eventId);
		if (eventId) state.seenEventIds.add(eventId);
		return { messageId: "comms-msg-1", threadId: "comms-thread-1" };
	},
	async recordDelivery({ idempotencyKey }) {
		state.deliveryCalls.push({ idempotencyKey });
	},
};

const ALICE_DEVICE: ResolvedDevice = {
	deviceId: "device-alice",
	userId: "user-alice",
	organizationId: "org-1",
};
const BOB_DEVICE: ResolvedDevice = {
	deviceId: "device-bob",
	userId: "user-bob",
	organizationId: "org-2",
};

const RAW: MeshRawInbound = {
	fromPubkey: BOB_PUB,
	toPubkey: ALICE_PUB,
	body: "hello over nostr",
	eventId: "event-1",
	thread: "thread-9",
	relayUrl: "wss://relay.rox.one",
};

beforeEach(() => {
	state.knownPubkeys = new Map([
		[ALICE_PUB, ALICE_DEVICE],
		[BOB_PUB, BOB_DEVICE],
	]);
	state.seenEventIds = new Set();
	state.emitCalls = 0;
	state.emittedEventIds = [];
	state.deliveryCalls = [];
});

describe("ingestInboundMesh", () => {
	test("accepted: emits to the D1 inbox + ledgers the delivery", async () => {
		const res = await ingestInboundMesh(fakeDb, RAW);
		expect(res.kind).toBe("accepted");
		if (res.kind === "accepted") {
			expect(res.messageId).toBe("comms-msg-1");
			expect(res.threadId).toBe("comms-thread-1");
		}
		expect(state.emitCalls).toBe(1);
		expect(state.deliveryCalls).toHaveLength(1);
		expect(state.deliveryCalls[0]?.idempotencyKey).toBe("event-1");
	});

	test("duplicate: a redelivered event is a no-op (no emit/ledger)", async () => {
		state.seenEventIds.add("event-1");
		const res = await ingestInboundMesh(fakeDb, RAW);
		expect(res.kind).toBe("duplicate");
		if (res.kind === "duplicate") expect(res.eventId).toBe("event-1");
		expect(state.emitCalls).toBe(0);
		expect(state.deliveryCalls).toHaveLength(0);
	});

	test("no_such_pubkey: unknown RECIPIENT is rejected before any write", async () => {
		const res = await ingestInboundMesh(fakeDb, {
			...RAW,
			toPubkey: STRANGER_PUB,
		});
		expect(res.kind).toBe("no_such_pubkey");
		expect(state.emitCalls).toBe(0);
	});

	test("no_such_pubkey: unknown SENDER is rejected (anti-spam)", async () => {
		const res = await ingestInboundMesh(fakeDb, {
			...RAW,
			fromPubkey: STRANGER_PUB,
		});
		expect(res.kind).toBe("no_such_pubkey");
		expect(state.emitCalls).toBe(0);
		expect(state.deliveryCalls).toHaveLength(0);
	});

	test("derives a deterministic dedup id when the event has no id", async () => {
		const { eventId: _omit, ...noId } = RAW;
		const res = await ingestInboundMesh(fakeDb, noId);
		expect(res.kind).toBe("accepted");
		const key = state.deliveryCalls[0]?.idempotencyKey;
		expect(key).toMatch(/^mesh-derived:/);
		expect(state.emittedEventIds[0]).toBe(key);
	});

	test("redelivery WITHOUT an event id does not create a second inbox row", async () => {
		const { eventId: _omit, ...rest } = RAW;
		const noId = { ...rest, sentAt: 1_750_000_000 };

		const first = await ingestInboundMesh(fakeDb, noId);
		expect(first.kind).toBe("accepted");
		expect(state.emitCalls).toBe(1);

		const second = await ingestInboundMesh(fakeDb, noId);
		expect(second.kind).toBe("duplicate");
		expect(state.emitCalls).toBe(1);
		expect(state.deliveryCalls).toHaveLength(1);
	});

	test("distinct id-less events are NOT collapsed by the derived dedup id", async () => {
		const { eventId: _omit, ...base } = RAW;
		const first = await ingestInboundMesh(fakeDb, base);
		expect(first.kind).toBe("accepted");

		const second = await ingestInboundMesh(fakeDb, {
			...base,
			body: "a completely different message",
			sentAt: 1_760_000_000,
		});
		expect(second.kind).toBe("accepted");
		expect(state.emitCalls).toBe(2);
		expect(state.emittedEventIds[0]).not.toBe(state.emittedEventIds[1]);
	});
});
