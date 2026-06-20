import { describe, expect, test } from "bun:test";
import type { OutboundDraft } from "../types";
import {
	MeshAdapter,
	type MeshRawInbound,
	type MeshSignedEvent,
	type MeshUnsignedEvent,
} from "./MeshAdapter";
import type { SendContext } from "./TransportAdapter";

const ALICE_PUB = "a".repeat(64);
const BOB_PUB = "b".repeat(64);

function makeAdapter(
	over: Partial<ConstructorParameters<typeof MeshAdapter>[0]> = {},
) {
	const signed: MeshUnsignedEvent[] = [];
	const published: MeshSignedEvent[] = [];
	const adapter = new MeshAdapter({
		sign: (event) => {
			signed.push(event);
			return { id: "event-fixed", payload: { ...event, sig: "fake-sig" } };
		},
		publish: (s) => {
			published.push(s);
			return Promise.resolve({ id: s.id });
		},
		now: () => new Date("2026-06-21T10:00:00.000Z"),
		mintEventId: () => "minted-fixed",
		...over,
	});
	return { adapter, signed, published };
}

const CTX: SendContext = {
	toAddress: BOB_PUB,
	delivery: { id: "d1", messageId: "m1", transport: "mesh" },
};

describe("MeshAdapter.kind", () => {
	test("discriminates as mesh", () => {
		const { adapter } = makeAdapter();
		expect(adapter.kind).toBe("mesh");
	});
});

describe("MeshAdapter.normalizeInbound", () => {
	test("maps a relay event into the hub shape (transport=mesh)", () => {
		const { adapter } = makeAdapter();
		const raw: MeshRawInbound = {
			fromPubkey: BOB_PUB.toUpperCase(),
			toPubkey: ALICE_PUB,
			body: "hello over nostr",
			eventId: "event-7",
			thread: "thread-9",
			subject: "hi",
			kind: 14,
			relayUrl: "wss://relay.rox.one",
			sentAt: "2026-06-21T10:00:00.000Z",
		};
		const msg = adapter.normalizeInbound(raw);

		expect(msg.transport).toBe("mesh");
		expect(msg.externalId).toBe("event-7");
		// Pubkey normalized (lowercased).
		expect(msg.from).toBe(BOB_PUB);
		expect(msg.to).toEqual([ALICE_PUB]);
		expect(msg.body).toBe("hello over nostr");
		expect(msg.subject).toBe("hi");
		expect(msg.createdAt.toISOString()).toBe("2026-06-21T10:00:00.000Z");
		expect(msg.metadata.thread).toBe("thread-9");
		expect(msg.metadata.fromPubkey).toBe(BOB_PUB);
		expect(msg.metadata.relayUrl).toBe("wss://relay.rox.one");
	});

	test("carries reply threading + tolerates a missing event id", () => {
		const { adapter } = makeAdapter();
		const msg = adapter.normalizeInbound({
			fromPubkey: BOB_PUB,
			toPubkey: ALICE_PUB,
			body: "re: hi",
			replyToEventId: "event-7",
		});
		expect(msg.externalId).toBeNull();
		expect(msg.inReplyToExternalId).toBe("event-7");
	});

	test("interprets a numeric unix-seconds created_at", () => {
		const { adapter } = makeAdapter();
		const msg = adapter.normalizeInbound({
			fromPubkey: BOB_PUB,
			toPubkey: ALICE_PUB,
			body: "hi",
			sentAt: 1_750_500_000, // unix seconds
		});
		expect(msg.createdAt.getTime()).toBe(1_750_500_000 * 1000);
	});
});

describe("MeshAdapter.send", () => {
	const draft: OutboundDraft = {
		organizationId: "org-1",
		authorUserId: "user-1",
		recipients: [{ kind: "address", address: BOB_PUB }],
		body: "reply from rox",
	};

	test("builds, signs (injected), and publishes the event", async () => {
		const { adapter, signed, published } = makeAdapter({
			resolveFromPubkey: async () => ALICE_PUB,
		});
		const res = await adapter.send(draft, CTX);

		expect(signed).toHaveLength(1);
		expect(published).toHaveLength(1);
		const ev = signed[0];
		expect(ev?.fromPubkey).toBe(ALICE_PUB);
		expect(ev?.toPubkey).toBe(BOB_PUB);
		expect(ev?.kind).toBe(14);
		expect(ev?.body).toBe("reply from rox");
		expect(ev?.createdAt).toBe(
			Math.floor(Date.parse("2026-06-21T10:00:00.000Z") / 1000),
		);
		expect(res.providerId).toBe("event-fixed");
	});

	test("falls back to metadata.fromPubkey when no resolver is set", async () => {
		const { adapter, signed } = makeAdapter();
		await adapter.send({ ...draft, metadata: { fromPubkey: ALICE_PUB } }, CTX);
		expect(signed[0]?.fromPubkey).toBe(ALICE_PUB);
	});

	test("throws when no author pubkey can be resolved", async () => {
		const { adapter } = makeAdapter();
		await expect(adapter.send(draft, CTX)).rejects.toThrow(/author pubkey/);
	});

	test("propagates thread + reply ids from draft metadata", async () => {
		const { adapter, signed } = makeAdapter({
			resolveFromPubkey: async () => ALICE_PUB,
		});
		await adapter.send(
			{ ...draft, metadata: { thread: "t-1", replyToEventId: "e-1" } },
			CTX,
		);
		expect(signed[0]?.thread).toBe("t-1");
		expect(signed[0]?.replyToEventId).toBe("e-1");
	});

	test("uses the relay-accepted id as the provider id", async () => {
		const { adapter } = makeAdapter({
			resolveFromPubkey: async () => ALICE_PUB,
			publish: async () => ({ id: "relay-accepted-id" }),
		});
		const res = await adapter.send(draft, CTX);
		expect(res.providerId).toBe("relay-accepted-id");
	});

	test("never signs inline — only the injected signer runs", async () => {
		let signerCalls = 0;
		const { adapter } = makeAdapter({
			resolveFromPubkey: async () => ALICE_PUB,
			sign: (event) => {
				signerCalls++;
				return { id: "sig-id", payload: event };
			},
		});
		await adapter.send(draft, CTX);
		expect(signerCalls).toBe(1);
	});
});
