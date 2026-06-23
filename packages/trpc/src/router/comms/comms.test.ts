import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// env-free trpc harness in dashboard.test.ts). A queue of result-sets drives
// each `select`; inserts/updates record their values and return configured rows.

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
	updateReturning: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	updateReturning: [{ id: "participant-1" }],
};

// Read a drizzle pgTable's name off its `Symbol(drizzle:Name)` so the stub can
// special-case the `members` table the REAL assertOrgMembers guard queries (the
// quota.test.ts pattern). Routing `members` by name keeps it OFF the positional
// `selectQueue` so the membership probe never shifts a result-set meant for a
// later router select.
function tableName(table: unknown): string {
	if (!table || typeof table !== "object") return "";
	const sym = Object.getOwnPropertySymbols(table).find(
		(s) => s.description === "drizzle:Name",
	);
	return sym ? String((table as Record<symbol, unknown>)[sym]) : "";
}

// assertOrgMembers runs `WHERE org=$1 AND user_id = ANY($userIds)`. Pull the
// bound param values out of the drizzle where-clause (each is a `Param` with a
// `value`/`encoder`); the first is the org id, the rest are the queried userIds.
function whereParamValues(clause: unknown): unknown[] {
	const out: unknown[] = [];
	const seen = new Set<unknown>();
	const walk = (o: unknown, depth = 0): void => {
		if (depth > 8 || !o || typeof o !== "object" || seen.has(o)) return;
		seen.add(o);
		const rec = o as Record<string, unknown>;
		if ("value" in rec && "encoder" in rec) out.push(rec.value);
		for (const v of Object.values(rec)) {
			if (Array.isArray(v)) for (const it of v) walk(it, depth + 1);
			else if (v && typeof v === "object") walk(v, depth + 1);
		}
	};
	walk(clause);
	return out;
}

// Echo back a `{ userId }` row for every userId in the `members` where-clause so
// the real guard sees every requested recipient as a member (happy path).
function membersFromWhere(clause: unknown): AnyRow[] {
	return whereParamValues(clause)
		.filter((v) => typeof v === "string")
		.slice(1) // drop the org id; the remainder are the queried userIds
		.map((userId) => ({ userId }));
}

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, () => unknown>;
		p.from = step;
		p.where = step;
		p.orderBy = step;
		p.innerJoin = step;
		p.leftJoin = step;
		p.limit = step;
		return p;
	};
	return step();
}

// Table-aware builder: the `members` membership probe resolves from its own
// where-clause (never the positional queue); every other table drains the queue.
function tableAwareSelect() {
	let queued: AnyRow[] | null = null;
	const resolveFor = (table: unknown): AnyRow[] => {
		if (tableName(table) === "members") return [];
		if (queued === null) queued = state.selectQueue.shift() ?? [];
		return queued;
	};
	const builder = {
		from(table: unknown) {
			const isMembers = tableName(table) === "members";
			const rows = resolveFor(table);
			const make = (): Promise<AnyRow[]> & Record<string, () => unknown> => {
				const p = Promise.resolve(rows) as Promise<AnyRow[]> &
					Record<string, () => unknown>;
				p.where = (clause?: unknown) =>
					isMembers ? selectBuilder(membersFromWhere(clause)) : make();
				p.orderBy = make;
				p.innerJoin = make;
				p.leftJoin = make;
				p.limit = make;
				return p;
			};
			return make();
		},
	};
	return builder;
}

function nextSelect() {
	return tableAwareSelect();
}

function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			state.inserted.push({ values: arr });
			const chain = {
				onConflictDoNothing: () => chain,
				onConflictDoUpdate: () => chain,
				returning: () => Promise.resolve(state.insertReturning),
			};
			return chain;
		},
	};
}

function updateChain() {
	return {
		set(vals: AnyRow) {
			state.updated.push(vals);
			return {
				// `where()` is awaitable (no .returning() callers) AND exposes
				// .returning() for callers that want the rows back.
				where: () => {
					const p = Promise.resolve(state.updateReturning) as Promise<
						AnyRow[]
					> & { returning: () => Promise<AnyRow[]> };
					p.returning = () => Promise.resolve(state.updateReturning);
					return p;
				},
			};
		},
	};
}

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => updateChain(),
	delete: () => ({ where: () => Promise.resolve() }),
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
// Live delivery (comms SSE): capture publishes so we can assert sendMessage emits
// onto the bus after the write commits.
const publishCommsMessageMock = mock((_event: unknown) => {});
mock.module("@rox/shared/comms-events", () => ({
	publishCommsMessage: publishCommsMessageMock,
}));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve({ membership: {} }),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
	verifyOrgAdmin: () => Promise.resolve({ membership: {} }),
	verifyOrgOwner: () => Promise.resolve({ membership: {} }),
}));
// Contact resolver bridge — the router never hits the real graph-service.
mock.module("../../lib/graph", () => ({
	graphService: {
		resolveIdentity: () =>
			Promise.resolve({ contact: { id: "contact-1" }, created: true }),
	},
}));

const { commsRouter } = await import("./comms");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ comms: commsRouter });
const createCaller = createCallerFactory(appRouter);

function callerFor(activeOrganizationId: string | null, userId = "user-1") {
	return createCaller({
		session: {
			user: { id: userId, email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const MSG_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.updateReturning = [{ id: "participant-1" }];
	publishCommsMessageMock.mockClear();
});

describe("comms.listThreads", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.comms.listThreads()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("returns [] when the caller participates in no threads", async () => {
		state.selectQueue = [[]]; // participant lookup → empty
		const caller = callerFor("org-1");
		const res = await caller.comms.listThreads();
		expect(res).toEqual([]);
	});

	test("returns the caller's threads newest-first", async () => {
		state.selectQueue = [
			[{ threadId: "t-1" }], // participant lookup
			[{ id: "t-1", subject: "Hi" }], // thread fetch
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.listThreads();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe("t-1");
	});
});

describe("comms.getThread", () => {
	test("404s when the thread is not in the org", async () => {
		state.selectQueue = [[]]; // getThreadForOrg → empty
		const caller = callerFor("org-1");
		await expect(
			caller.comms.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("forbids a non-participant", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: OTHER_USER }], // participants (not caller)
		];
		const caller = callerFor("org-1");
		await expect(
			caller.comms.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("returns thread + participants + messages for a participant", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: "user-1" }], // participants (caller in)
			[{ id: MSG_ID, body: "hello" }], // messages
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.getThread({ threadId: THREAD_ID });
		expect(res.thread.id).toBe(THREAD_ID);
		expect(res.participants).toHaveLength(1);
		expect(res.messages).toHaveLength(1);
	});
});

describe("comms.sendMessage", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.comms.sendMessage({
				recipients: [{ kind: "userId", userId: OTHER_USER }],
				body: "hi",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("rejects an empty recipients list", async () => {
		const caller = callerFor("org-1");
		await expect(
			caller.comms.sendMessage({ recipients: [], body: "hi" }),
		).rejects.toThrow();
	});

	test("routes a new in-app message: persists message + delivery", async () => {
		// No threadId → resolveThread creates one. Router select calls (in order):
		//   1. resolveCounterpart.addresses.findByValue? (userId ref → skipped)
		//   2. selectTransport.presence.get → []
		//   3. resolveThread.findByDedupKey → []
		// Then inserts: thread, participants, message, delivery; update touchLastMessageAt.
		state.selectQueue = [
			[], // presence.get (recipient offline) → email? no; userId path: presence empty
			[], // findByDedupKey
		];
		state.insertReturning = [{ id: "row-new" }];
		const caller = callerFor("org-1");
		const res = await caller.comms.sendMessage({
			recipients: [{ kind: "userId", userId: OTHER_USER }],
			body: "hello there",
			clientId: "client-abc",
		});
		expect(res.messageId).toBeDefined();
		expect(res.threadId).toBeDefined();
		expect(res.deliveries).toHaveLength(1);
		// A message row and a delivery row were inserted.
		const insertedKinds = state.inserted.length;
		expect(insertedKinds).toBeGreaterThanOrEqual(2);

		// Live delivery: the committed send publishes exactly one in-app SSE event.
		expect(publishCommsMessageMock).toHaveBeenCalledTimes(1);
		expect(publishCommsMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				messageId: res.messageId,
				threadId: res.threadId,
				transport: "inapp",
			}),
		);
	});
});

describe("comms.editMessage", () => {
	// Queue the selects loadAuthoredMessageForOrg + the mutation drive, in order:
	//   1. message row (id, org)         — authorship probe
	//   2. thread row (getThreadForOrg)  — org/participant scoping
	//   3. participants (caller in)      — participant probe
	//   4. participants (publish fan-out)— SSE recipient set
	function queueEditSelects(message: AnyRow, participantUserId = "user-1") {
		state.selectQueue = [
			[message],
			[{ id: THREAD_ID, organizationId: "org-1" }],
			[{ id: "p-1", userId: participantUserId }],
			[{ userId: participantUserId }],
		];
	}

	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.comms.editMessage({ messageId: MSG_ID, body: "new" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("by author sets body + editedAt and publishes one in-app event", async () => {
		queueEditSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: "user-1",
			deletedAt: null,
		});
		const caller = callerFor("org-1");
		const res = await caller.comms.editMessage({
			messageId: MSG_ID,
			body: "new",
		});

		expect(res.messageId).toBe(MSG_ID);
		expect(res.threadId).toBe(THREAD_ID);
		expect(res.editedAt).toBeInstanceOf(Date);
		expect(state.updated[0]?.body).toBe("new");
		expect(state.updated[0]?.editedAt).toBeInstanceOf(Date);

		expect(publishCommsMessageMock).toHaveBeenCalledTimes(1);
		expect(publishCommsMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				threadId: THREAD_ID,
				transport: "inapp",
			}),
		);
	});

	test("by a non-author => FORBIDDEN (no update, no publish)", async () => {
		queueEditSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: OTHER_USER,
			deletedAt: null,
		});
		const caller = callerFor("org-1");
		await expect(
			caller.comms.editMessage({ messageId: MSG_ID, body: "new" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(state.updated).toHaveLength(0);
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("a null external author can never match the caller => FORBIDDEN", async () => {
		queueEditSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: null,
			deletedAt: null,
		});
		const caller = callerFor("org-1");
		await expect(
			caller.comms.editMessage({ messageId: MSG_ID, body: "new" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("404s when the message/org row is empty", async () => {
		state.selectQueue = [[]]; // message select → empty
		const caller = callerFor("org-1");
		await expect(
			caller.comms.editMessage({ messageId: MSG_ID, body: "new" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("refuses to edit an already-deleted message", async () => {
		queueEditSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: "user-1",
			deletedAt: new Date(),
		});
		const caller = callerFor("org-1");
		await expect(
			caller.comms.editMessage({ messageId: MSG_ID, body: "new" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(state.updated).toHaveLength(0);
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});
});

describe("comms.deleteMessage", () => {
	function queueDeleteSelects(message: AnyRow, participantUserId = "user-1") {
		state.selectQueue = [
			[message],
			[{ id: THREAD_ID, organizationId: "org-1" }],
			[{ id: "p-1", userId: participantUserId }],
			[{ userId: participantUserId }],
		];
	}

	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.comms.deleteMessage({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("by author sets deletedAt (tombstone) and publishes one event", async () => {
		queueDeleteSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: "user-1",
			body: "secret",
			deletedAt: null,
		});
		const caller = callerFor("org-1");
		const res = await caller.comms.deleteMessage({ messageId: MSG_ID });

		expect(res.messageId).toBe(MSG_ID);
		expect(res.threadId).toBe(THREAD_ID);
		expect(res.deletedAt).toBeInstanceOf(Date);
		// Tombstone keeps the row: only deletedAt is written, body untouched.
		expect(state.updated[0]?.deletedAt).toBeInstanceOf(Date);
		expect(state.updated[0]).not.toHaveProperty("body");

		expect(publishCommsMessageMock).toHaveBeenCalledTimes(1);
		expect(publishCommsMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org-1", transport: "inapp" }),
		);
	});

	test("by a non-author => FORBIDDEN (no update, no publish)", async () => {
		queueDeleteSelects({
			id: MSG_ID,
			organizationId: "org-1",
			threadId: THREAD_ID,
			authorUserId: OTHER_USER,
			deletedAt: null,
		});
		const caller = callerFor("org-1");
		await expect(
			caller.comms.deleteMessage({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(state.updated).toHaveLength(0);
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("404s when the message/org row is empty", async () => {
		state.selectQueue = [[]];
		const caller = callerFor("org-1");
		await expect(
			caller.comms.deleteMessage({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("comms.getThread (edit/delete read-path)", () => {
	test("withholds a deleted message's body/attachments on read", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: "user-1" }], // participants (caller in)
			[
				{
					id: MSG_ID,
					body: "secret",
					bodyHtml: "<p>secret</p>",
					attachments: [{ name: "f", url: "u" }],
					authorUserId: "user-1",
					deletedAt: new Date(),
					editedAt: null,
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.getThread({ threadId: THREAD_ID });
		expect(res.messages).toHaveLength(1);
		expect(res.messages[0]?.body).toBe("");
		expect(res.messages[0]?.bodyHtml).toBeNull();
		expect(res.messages[0]?.attachments).toHaveLength(0);
		// The tombstone metadata is still surfaced so the UI can render it.
		expect(res.messages[0]?.deletedAt).toBeInstanceOf(Date);
	});

	test("surfaces editedAt and keeps the body for a non-deleted edit", async () => {
		const edited = new Date();
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1" }], // thread
			[{ id: "p-1", userId: "user-1" }], // participants (caller in)
			[{ id: MSG_ID, body: "updated", deletedAt: null, editedAt: edited }],
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.getThread({ threadId: THREAD_ID });
		expect(res.messages[0]?.body).toBe("updated");
		expect(res.messages[0]?.editedAt).toBe(edited);
	});
});

describe("comms.markRead", () => {
	test("404s when the thread is not in the org", async () => {
		state.selectQueue = [[]]; // getThreadForOrg → empty
		const caller = callerFor("org-1");
		await expect(
			caller.comms.markRead({ threadId: THREAD_ID, lastReadMessageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("sets the watermark for a participant", async () => {
		state.selectQueue = [[{ id: THREAD_ID, organizationId: "org-1" }]];
		state.updateReturning = [{ id: "participant-1" }];
		const caller = callerFor("org-1");
		const res = await caller.comms.markRead({
			threadId: THREAD_ID,
			lastReadMessageId: MSG_ID,
		});
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.lastReadMessageId).toBe(MSG_ID);
	});

	test("forbids a non-participant (no participant row updated)", async () => {
		state.selectQueue = [[{ id: THREAD_ID, organizationId: "org-1" }]];
		state.updateReturning = []; // update matched no participant row
		const caller = callerFor("org-1");
		await expect(
			caller.comms.markRead({ threadId: THREAD_ID, lastReadMessageId: MSG_ID }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("comms.updatePresence (I4)", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.comms.updatePresence({ state: "online" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("upserts presence and returns the merged state", async () => {
		state.selectQueue = [
			[], // upsert reads current presence → none yet
		];
		state.insertReturning = [
			{
				userId: "user-1",
				organizationId: "org-1",
				state: "online",
				perTransport: {
					inapp: { state: "online", at: new Date().toISOString() },
				},
				statusText: null,
				updatedAt: new Date(),
			},
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.updatePresence({ state: "online" });
		expect(res.userId).toBe("user-1");
		expect(res.state).toBe("online");
		// The presence row was written.
		const presenceInsert = state.inserted.find(
			(i) => i.values[0]?.state !== undefined && "perTransport" in i.values[0],
		);
		expect(presenceInsert).toBeDefined();
	});
});

describe("comms.presence (I4)", () => {
	test("returns offline + stale when no presence row exists", async () => {
		state.selectQueue = [[]]; // presence.get → none
		const caller = callerFor("org-1");
		const res = await caller.comms.presence({});
		expect(res.state).toBe("offline");
		expect(res.stale).toBe(true);
		expect(res.updatedAt).toBeNull();
	});

	test("returns the live state for a fresh heartbeat", async () => {
		state.selectQueue = [
			[
				{
					userId: "user-1",
					organizationId: "org-1",
					state: "online",
					perTransport: {},
					statusText: "around",
					updatedAt: new Date(),
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.presence({});
		expect(res.state).toBe("online");
		expect(res.stale).toBe(false);
	});

	test("decays a STALE online row to offline", async () => {
		state.selectQueue = [
			[
				{
					userId: "user-1",
					organizationId: "org-1",
					state: "online",
					perTransport: {},
					statusText: null,
					updatedAt: new Date(Date.now() - 10 * 60_000), // past TTL
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.comms.presence({});
		expect(res.state).toBe("offline");
		expect(res.stale).toBe(true);
	});
});
