import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The Drizzle-backed mesh `emitToUnifiedInbox` must write a `comms_participants`
 * row for the recipient rox user (`args.toUserId`) after find-or-create of the
 * thread — otherwise the SSE leak-gate (`isThreadParticipant`, which checks
 * `comms_participants` directly and ignores the advisory `participantUserIds`)
 * drops every published mesh event and the thread never surfaces via
 * `comms.listThreads/getThread`. This mirrors the email path's `FIX 1`.
 *
 * A resolvable sender counterpart (a known rox `mesh` address in
 * `comms_addresses`) is added as a participant too, so an internal rox→rox mesh
 * DM threads for BOTH parties. The participant write is idempotent on the
 * `(thread_id, user_id)` partial unique (`onConflictDoNothing()`).
 *
 * `@rox/db/client` is stubbed so the suite needs no live database. We do NOT
 * mock the `@rox/shared/comms-events` barrel — `publishCommsMessage` is a
 * best-effort no-op without a subscriber, so it runs for real.
 */

type AnyRow = Record<string, unknown>;

const state: {
	// Rows the next select() should return, in FIFO order.
	selectQueue: AnyRow[][];
	insertedThreads: AnyRow[];
	insertedMessages: AnyRow[];
	insertedParticipants: AnyRow[];
	threadReturning: AnyRow[];
	messageReturning: AnyRow[];
	participantConflictHits: number;
} = {
	selectQueue: [],
	insertedThreads: [],
	insertedMessages: [],
	insertedParticipants: [],
	threadReturning: [{ id: "thread-1" }],
	messageReturning: [{ id: "comms-msg-new" }],
	participantConflictHits: 0,
};

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

function nextSelect() {
	return selectBuilder(state.selectQueue.shift() ?? []);
}

// The fake distinguishes inserts by columns:
//   message     → has `transport`
//   participant → has `role`, no transport
//   thread      → everything else (subject/dedupKey/lastMessageAt)
type InsertKind = "message" | "participant" | "thread";

function classifyInsert(row: AnyRow): InsertKind {
	if ("transport" in row) return "message";
	if ("role" in row) return "participant";
	return "thread";
}

function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			const row = arr[0] ?? {};
			const kind = classifyInsert(row);
			if (kind === "message") {
				state.insertedMessages.push(row);
			} else if (kind === "participant") {
				for (const r of arr) state.insertedParticipants.push(r);
			} else {
				state.insertedThreads.push(row);
			}
			const returningRows =
				kind === "message" ? state.messageReturning : state.threadReturning;
			return {
				onConflictDoNothing: () => {
					if (kind === "participant") state.participantConflictHits += 1;
					return {
						returning: () => Promise.resolve(returningRows),
					};
				},
				returning: () => Promise.resolve(returningRows),
			};
		},
	};
}

function updateChain() {
	return {
		set() {
			return { where: () => Promise.resolve([]) };
		},
	};
}

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => updateChain(),
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));

const { createMeshIngestDb } = await import("./drizzleDb");

const baseArgs = {
	organizationId: "org-1",
	toUserId: "user-recipient",
	fromPubkey: "b".repeat(64),
	toPubkey: "a".repeat(64),
	body: "hello over nostr",
	subject: null,
	eventId: "event-1",
	replyToEventId: null,
	thread: "thread-9",
	relayUrl: "wss://relay.rox.one",
	createdAt: new Date("2026-06-23T00:00:00.000Z"),
};

beforeEach(() => {
	state.selectQueue = [];
	state.insertedThreads = [];
	state.insertedMessages = [];
	state.insertedParticipants = [];
	state.threadReturning = [{ id: "thread-1" }];
	state.messageReturning = [{ id: "comms-msg-new" }];
	state.participantConflictHits = 0;
});

describe("createMeshIngestDb.emitToUnifiedInbox participants", () => {
	test("writes a comms_participant row for the recipient (external sender)", async () => {
		const db = createMeshIngestDb();
		state.selectQueue = [
			[], // thread by dedup → none → create
			[], // sender mesh-address lookup → external (unknown)
		];
		const res = await db.emitToUnifiedInbox(baseArgs);
		expect(res.threadId).toBe("thread-1");

		// The recipient rox user is a participant so the SSE leak-gate forwards and
		// comms.listThreads/getThread surface the thread.
		expect(state.insertedParticipants).toHaveLength(1);
		const recipient = state.insertedParticipants[0];
		expect(recipient?.userId).toBe("user-recipient");
		expect(recipient?.threadId).toBe("thread-1");
		expect(recipient?.organizationId).toBe("org-1");
		expect(recipient?.role).toBe("member");
		// The participant insert is idempotent on the (thread, user) partial unique.
		expect(state.participantConflictHits).toBe(1);
	});

	test("adds a resolvable rox sender counterpart as a participant too", async () => {
		const db = createMeshIngestDb();
		state.selectQueue = [
			[], // thread by dedup → none → create
			[{ userId: "user-sender" }], // sender mesh-address → known rox user
		];
		await db.emitToUnifiedInbox(baseArgs);

		const userIds = state.insertedParticipants.map((p) => p.userId);
		expect(userIds).toContain("user-recipient");
		expect(userIds).toContain("user-sender");
		expect(state.insertedParticipants).toHaveLength(2);
	});

	test("idempotent on repeat: a reply into an existing thread re-writes the participant with onConflictDoNothing", async () => {
		const db = createMeshIngestDb();
		// Existing thread (a reply threading in) + external sender.
		state.selectQueue = [
			[{ id: "thread-existing" }], // thread by dedup → found
			[], // sender mesh-address lookup → external
		];
		await db.emitToUnifiedInbox({ ...baseArgs, eventId: "event-2" });

		expect(state.insertedParticipants).toHaveLength(1);
		expect(state.insertedParticipants[0]?.threadId).toBe("thread-existing");
		// onConflictDoNothing guards the repeat so no duplicate participant row.
		expect(state.participantConflictHits).toBe(1);
	});

	test("does not duplicate the recipient when it is also the resolved sender", async () => {
		const db = createMeshIngestDb();
		state.selectQueue = [
			[], // thread by dedup → none → create
			[{ userId: "user-recipient" }], // sender resolves to the SAME user
		];
		await db.emitToUnifiedInbox(baseArgs);

		// De-duped to a single participant row (the find-or-create filters the set).
		expect(state.insertedParticipants).toHaveLength(1);
		expect(state.insertedParticipants[0]?.userId).toBe("user-recipient");
	});
});
