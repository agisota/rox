import { beforeEach, describe, expect, it } from "bun:test";
import { AdapterRegistry } from "../adapter/AdapterRegistry";
import { InAppAdapter } from "../adapter/InAppAdapter";
import type { TransportAdapter } from "../adapter/TransportAdapter";
import type { CommsPorts } from "../ports";
import type {
	CommsAddress,
	CommsDelivery,
	CommsMessage,
	CommsParticipant,
	CommsPresence,
	CommsPresenceState,
	CommsThread,
	NormalizedMessage,
} from "../types";
import { MessageRouter } from "./MessageRouter";

const ORG = "org-1";

// ---------------------------------------------------------------------------
// In-memory fake ports (no database)
// ---------------------------------------------------------------------------

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

interface Fakes {
	ports: CommsPorts;
	addresses: Map<string, CommsAddress>;
	threads: Map<string, CommsThread>;
	participants: CommsParticipant[];
	messages: Map<string, CommsMessage>;
	deliveries: Map<string, CommsDelivery>;
	presence: Map<string, CommsPresence>;
	contactCalls: Array<{ value: string }>;
}

function makeFakes(seed?: {
	addresses?: CommsAddress[];
	presence?: CommsPresence[];
}): Fakes {
	const addresses = new Map<string, CommsAddress>();
	const threads = new Map<string, CommsThread>();
	const participants: CommsParticipant[] = [];
	const messages = new Map<string, CommsMessage>();
	const deliveries = new Map<string, CommsDelivery>();
	const presence = new Map<string, CommsPresence>();
	const contactCalls: Array<{ value: string }> = [];

	for (const a of seed?.addresses ?? []) {
		addresses.set(`${a.organizationId}:${a.value}`, a);
	}
	for (const p of seed?.presence ?? []) {
		presence.set(`${p.organizationId}:${p.userId}`, p);
	}

	const messageExternalIndex = new Map<string, string>(); // (transport:extId) -> messageId
	const messageToThread = new Map<string, string>(); // (transport:extId) -> threadId

	const ports: CommsPorts = {
		addresses: {
			async findByValue({ organizationId, value }) {
				return addresses.get(`${organizationId}:${value}`) ?? null;
			},
			async findRoxAddressByUser({ userId }) {
				// I2: resolve a userId → its primary @rox.one email so an in-app DM
				// and its email reply share a participant-set dedup key.
				for (const a of addresses.values()) {
					if (a.userId === userId && a.kind === "email" && !a.isAlias) {
						return a.value;
					}
				}
				return null;
			},
		},
		contacts: {
			async resolveContact({ value }) {
				contactCalls.push({ value });
				return { contactEntityId: `contact:${value}` };
			},
		},
		threads: {
			async findByDedupKey({ organizationId, dedupKey }) {
				for (const t of threads.values()) {
					if (t.organizationId === organizationId && t.dedupKey === dedupKey) {
						return t;
					}
				}
				return null;
			},
			async findThreadByMessageExternalId({ externalId }) {
				// I2: transport-agnostic — mirrors the production port which dropped
				// the transport filter so a reply on any transport matches.
				const threadId = messageToThread.get(externalId);
				return threadId ? (threads.get(threadId) ?? null) : null;
			},
			async createThread({
				organizationId,
				subject,
				dedupKey,
				participants: ps,
			}) {
				const thread: CommsThread = {
					id: nextId("thread"),
					organizationId,
					subject,
					dedupKey,
					lastMessageAt: null,
				};
				threads.set(thread.id, thread);
				for (const p of ps) {
					participants.push({
						id: nextId("part"),
						organizationId,
						threadId: thread.id,
						userId: p.userId,
						contactEntityId: p.contactEntityId,
						role: p.role,
						lastReadMessageId: null,
					});
				}
				return thread;
			},
			async addParticipants({ threadId, organizationId, participants: ps }) {
				const added: CommsParticipant[] = [];
				for (const p of ps) {
					const exists = participants.some(
						(x) =>
							x.threadId === threadId &&
							((p.userId && x.userId === p.userId) ||
								(p.contactEntityId && x.contactEntityId === p.contactEntityId)),
					);
					if (exists) continue;
					const row: CommsParticipant = {
						id: nextId("part"),
						organizationId,
						threadId,
						userId: p.userId,
						contactEntityId: p.contactEntityId,
						role: p.role,
						lastReadMessageId: null,
					};
					participants.push(row);
					added.push(row);
				}
				return added;
			},
			async touchLastMessageAt({ threadId, at }) {
				const t = threads.get(threadId);
				if (t) t.lastMessageAt = at;
			},
		},
		messages: {
			async findByExternalId({ transport, externalId }) {
				const id = messageExternalIndex.get(`${transport}:${externalId}`);
				return id ? (messages.get(id) ?? null) : null;
			},
			async insert(args) {
				const message: CommsMessage = {
					id: nextId("msg"),
					organizationId: args.organizationId,
					threadId: args.threadId,
					transport: args.transport,
					direction: args.direction,
					authorUserId: args.authorUserId,
					authorContactEntityId: args.authorContactEntityId,
					externalId: args.externalId,
					inReplyToExternalId: args.inReplyToExternalId,
					body: args.body,
					bodyHtml: args.bodyHtml,
					attachments: args.attachments,
					metadata: args.metadata,
					createdAt: args.createdAt,
					receivedAt: new Date(),
				};
				messages.set(message.id, message);
				if (args.externalId) {
					// (transport, external_id) is the per-transport idempotency key,
					// but thread lookup by external id is transport-agnostic (I2).
					messageExternalIndex.set(
						`${args.transport}:${args.externalId}`,
						message.id,
					);
					messageToThread.set(args.externalId, args.threadId);
				}
				return message;
			},
		},
		deliveries: {
			async insert(args) {
				const delivery: CommsDelivery = {
					id: nextId("delivery"),
					organizationId: args.organizationId,
					messageId: args.messageId,
					transport: args.transport,
					toAddress: args.toAddress,
					status: args.status,
					providerId: null,
					error: null,
					attempts: 0,
				};
				deliveries.set(delivery.id, delivery);
				return delivery;
			},
			async updateStatus({ deliveryId, status, providerId, error }) {
				const d = deliveries.get(deliveryId);
				if (!d) return;
				d.status = status;
				if (providerId !== undefined) d.providerId = providerId;
				if (error !== undefined) d.error = error;
			},
		},
		presence: {
			async get({ organizationId, userId }) {
				return presence.get(`${organizationId}:${userId}`) ?? null;
			},
		},
	};

	return {
		ports,
		addresses,
		threads,
		participants,
		messages,
		deliveries,
		presence,
		contactCalls,
	};
}

function userAddress(userId: string, value: string): CommsAddress {
	return {
		id: nextId("addr"),
		organizationId: ORG,
		userId,
		kind: "email",
		value,
		isPrimary: true,
		isAlias: false,
		verified: true,
	};
}

function presenceRow(userId: string, state: CommsPresenceState): CommsPresence {
	return {
		userId,
		organizationId: ORG,
		state,
		perTransport: {},
		statusText: null,
		updatedAt: new Date(),
	};
}

function inbound(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
	return {
		transport: "email",
		externalId: nextId("ext"),
		inReplyToExternalId: null,
		from: "alice@external.com",
		to: ["mark@rox.one"],
		subject: "Hello",
		body: "hi",
		bodyHtml: null,
		attachments: [],
		createdAt: new Date("2026-06-20T10:00:00Z"),
		metadata: {},
		...over,
	};
}

beforeEach(() => {
	idSeq = 0;
});

// ---------------------------------------------------------------------------
// resolveCounterpart
// ---------------------------------------------------------------------------

describe("resolveCounterpart", () => {
	it("resolves a known rox address to a user", async () => {
		const fakes = makeFakes({
			addresses: [userAddress("user-mark", "mark@rox.one")],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const cp = await router.resolveCounterpart(ORG, {
			kind: "address",
			address: "Mark@rox.one",
		});
		expect(cp).toEqual({
			type: "user",
			organizationId: ORG,
			userId: "user-mark",
			address: "mark@rox.one",
		});
	});

	it("find-or-creates an external contact for an unknown address", async () => {
		const fakes = makeFakes();
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry(),
		});
		const cp = await router.resolveCounterpart(ORG, {
			kind: "address",
			address: "stranger@external.com",
		});
		expect(cp.type).toBe("contact");
		if (cp.type === "contact") {
			expect(cp.contactEntityId).toBe("contact:stranger@external.com");
		}
		expect(fakes.contactCalls).toHaveLength(1);
	});

	it("resolves an alias address to the current owner", async () => {
		const alias: CommsAddress = {
			...userAddress("user-mark", "oldhandle@rox.one"),
			isPrimary: false,
			isAlias: true,
		};
		const fakes = makeFakes({ addresses: [alias] });
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry(),
		});
		const cp = await router.resolveCounterpart(ORG, {
			kind: "address",
			address: "oldhandle@rox.one",
		});
		expect(cp.type).toBe("user");
		if (cp.type === "user") expect(cp.userId).toBe("user-mark");
	});
});

// ---------------------------------------------------------------------------
// selectTransport
// ---------------------------------------------------------------------------

describe("selectTransport", () => {
	it("picks in-app for an online rox user", async () => {
		const fakes = makeFakes({ presence: [presenceRow("user-mark", "online")] });
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const t = await router.selectTransport({
			type: "user",
			organizationId: ORG,
			userId: "user-mark",
		});
		expect(t).toBe("inapp");
	});

	it("treats a STALE online presence as offline → not in-app reachable (I4 TTL)", async () => {
		const stale: CommsPresence = {
			...presenceRow("user-mark", "online"),
			updatedAt: new Date(Date.now() - 10 * 60_000), // 10 min ago, past TTL
		};
		const fakes = makeFakes({ presence: [stale] });
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const t = await router.selectTransport({
			type: "user",
			organizationId: ORG,
			userId: "user-mark",
		});
		expect(t).toBe("email");
	});

	it("falls back to email for an offline rox user (no other adapters)", async () => {
		const fakes = makeFakes({
			presence: [presenceRow("user-mark", "offline")],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const t = await router.selectTransport({
			type: "user",
			organizationId: ORG,
			userId: "user-mark",
		});
		expect(t).toBe("email");
	});

	it("prefers xmpp over email for an offline user when xmpp is registered", async () => {
		const xmpp: TransportAdapter = {
			kind: "xmpp",
			normalizeInbound: () => {
				throw new Error("unused");
			},
			send: async () => ({ providerId: "x" }),
		};
		const fakes = makeFakes({
			presence: [presenceRow("user-mark", "offline")],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter(), xmpp]),
		});
		const t = await router.selectTransport({
			type: "user",
			organizationId: ORG,
			userId: "user-mark",
		});
		expect(t).toBe("xmpp");
	});

	it("always uses email for an external contact", async () => {
		const fakes = makeFakes();
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const t = await router.selectTransport({
			type: "contact",
			organizationId: ORG,
			contactEntityId: "contact:x",
			address: "x@external.com",
		});
		expect(t).toBe("email");
	});
});

// ---------------------------------------------------------------------------
// routeInbound — threading + dedup
// ---------------------------------------------------------------------------

describe("routeInbound", () => {
	function buildRouter() {
		const fakes = makeFakes({
			addresses: [userAddress("user-mark", "mark@rox.one")],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		return { fakes, router };
	}

	it("creates a new thread + message for a first inbound", async () => {
		const { fakes, router } = buildRouter();
		const res = await router.routeInbound(ORG, inbound({ externalId: "e1" }));
		expect(res.deduped).toBe(false);
		expect(fakes.threads.size).toBe(1);
		expect(fakes.messages.size).toBe(1);
		expect(res.message.direction).toBe("inbound");
		// external author → contact, rox recipient → user participant.
		expect(res.message.authorContactEntityId).toBe(
			"contact:alice@external.com",
		);
	});

	it("dedups a redelivered webhook on (transport, external_id)", async () => {
		const { fakes, router } = buildRouter();
		const msg = inbound({ externalId: "dup-1" });
		const first = await router.routeInbound(ORG, msg);
		const second = await router.routeInbound(ORG, { ...msg });
		expect(first.deduped).toBe(false);
		expect(second.deduped).toBe(true);
		expect(second.message.id).toBe(first.message.id);
		expect(fakes.messages.size).toBe(1);
		expect(fakes.threads.size).toBe(1);
	});

	it("treats the same external_id on a different transport as distinct", async () => {
		const { fakes, router } = buildRouter();
		await router.routeInbound(
			ORG,
			inbound({ externalId: "shared", transport: "email" }),
		);
		await router.routeInbound(
			ORG,
			inbound({ externalId: "shared", transport: "xmpp", from: "bob@rox.one" }),
		);
		expect(fakes.messages.size).toBe(2);
	});

	it("joins an existing thread when a reply references a prior message", async () => {
		const { fakes, router } = buildRouter();
		const root = await router.routeInbound(
			ORG,
			inbound({ externalId: "root-1", transport: "email" }),
		);
		const reply = await router.routeInbound(
			ORG,
			inbound({
				externalId: "reply-1",
				inReplyToExternalId: "root-1",
				transport: "email",
				from: "mark@rox.one",
				to: ["alice@external.com"],
			}),
		);
		expect(reply.thread.id).toBe(root.thread.id);
		expect(fakes.threads.size).toBe(1);
		expect(fakes.messages.size).toBe(2);
	});

	it("merges an email reply into the thread an in-app DM opened (I2, transport-agnostic reply root)", async () => {
		// Two rox users with @rox.one addresses.
		const fakes = makeFakes({
			addresses: [
				userAddress("user-mark", "mark@rox.one"),
				userAddress("user-bob", "bob@rox.one"),
				userAddress("user-alice", "alice@external.com"), // not used
			].slice(0, 2),
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});

		// 1. mark opens an in-app DM to bob; the in-app message carries an external
		//    id (client/stanza id) so a reply can root off it.
		const dm = await router.routeInbound(
			ORG,
			inbound({
				transport: "inapp",
				externalId: "inapp-msg-1",
				from: "mark@rox.one",
				to: ["bob@rox.one"],
			}),
		);

		// 2. bob replies BY EMAIL, referencing the in-app message's external id.
		//    The transport-agnostic reply-root lookup must merge it (not fork).
		const reply = await router.routeInbound(
			ORG,
			inbound({
				transport: "email",
				externalId: "email-reply-1",
				inReplyToExternalId: "inapp-msg-1",
				from: "bob@rox.one",
				to: ["mark@rox.one"],
			}),
		);

		expect(reply.thread.id).toBe(dm.thread.id);
		expect(fakes.threads.size).toBe(1);
		expect(fakes.messages.size).toBe(2);
	});

	it("merges an in-app DM (userId send) with its email reply by participant-set key (I2 dedup alignment)", async () => {
		const fakes = makeFakes({
			addresses: [
				userAddress("user-mark", "mark@rox.one"),
				userAddress("user-bob", "bob@rox.one"),
			],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});

		// 1. mark sends an in-app DM to bob BY USERID (no address ref). The author +
		//    recipient must normalize to their @rox.one addresses for the dedup key.
		const outbound = await router.routeOutbound({
			organizationId: ORG,
			authorUserId: "user-mark",
			recipients: [{ kind: "userId", userId: "user-bob" }],
			body: "hi bob",
		});

		// 2. An inbound email between the same two @rox.one parties (no reply root)
		//    must land in the SAME thread via the participant-set dedup key.
		const email = await router.routeInbound(
			ORG,
			inbound({
				transport: "email",
				externalId: "em-reply-1",
				from: "bob@rox.one",
				to: ["mark@rox.one"],
			}),
		);

		expect(email.thread.id).toBe(outbound.thread.id);
		expect(fakes.threads.size).toBe(1);
	});

	it("merges by participant-set dedup key across transports", async () => {
		const { fakes, router } = buildRouter();
		// in-app DM between mark and alice
		const first = await router.routeInbound(
			ORG,
			inbound({
				transport: "inapp",
				externalId: "ia-1",
				from: "mark@rox.one",
				to: ["alice@external.com"],
			}),
		);
		// email between the same two parties, no reply header → participant-set key
		const second = await router.routeInbound(
			ORG,
			inbound({
				transport: "email",
				externalId: "em-1",
				from: "alice@external.com",
				to: ["mark@rox.one"],
			}),
		);
		expect(second.thread.id).toBe(first.thread.id);
		expect(fakes.threads.size).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// routeOutbound — fan-out + transport selection
// ---------------------------------------------------------------------------

describe("routeOutbound", () => {
	it("fans out with per-recipient transport and records sent deliveries", async () => {
		const fakes = makeFakes({
			addresses: [userAddress("user-bob", "bob@rox.one")],
			presence: [presenceRow("user-bob", "online")],
		});
		const router = new MessageRouter({
			ports: fakes.ports,
			adapters: new AdapterRegistry([new InAppAdapter()]),
		});
		const res = await router.routeOutbound({
			organizationId: ORG,
			authorUserId: "user-mark",
			recipients: [
				{ kind: "address", address: "bob@rox.one" }, // online rox user → inapp
				{ kind: "address", address: "ext@external.com" }, // contact → email (no adapter)
			],
			body: "hello",
		});

		expect(res.message.direction).toBe("outbound");
		expect(res.deliveries).toHaveLength(2);

		const bob = res.deliveries.find((d) => d.recipient.transport === "inapp");
		expect(bob?.status).toBe("sent");
		expect(bob?.providerId).toMatch(/^inapp:/);

		// email recipient has no registered adapter → failed, not thrown.
		const ext = res.deliveries.find((d) => d.recipient.transport === "email");
		expect(ext?.status).toBe("failed");
		expect(ext?.error).toContain("No adapter");
	});
});
