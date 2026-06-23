import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * M1 — the Drizzle-backed `emitToUnifiedInbox` must NOT 500 when two rox
 * recipients receive the same external Message-ID (the GLOBAL
 * `(transport, external_id)` unique would otherwise reject the second insert),
 * and it must thread inbound mail on the SAME participant-set dedup key the
 * comms-core router uses (so an email merges with the matching in-app DM).
 *
 * `@rox/db/client` is stubbed so the suite needs no live database (mirrors the
 * trpc comms/mail harness). The fake tracks inserted comms_messages and replays
 * a duplicate row for the second same-Message-ID emit.
 *
 * Also asserts the live-delivery wiring (comms SSE, hardening epic): a NEW
 * comms_messages insert publishes exactly one event onto the comms bus, while a
 * dedup short-circuit / conflict no-op publishes nothing.
 */

type AnyRow = Record<string, unknown>;

// Capture comms-bus publishes so we can assert publish-on-persist without a real
// EventEmitter subscription. Mocked at the module boundary the drizzleDb imports.
const publishCommsMessageMock = mock((_event: unknown) => {});
mock.module("@rox/shared/comms-events", () => ({
	publishCommsMessage: publishCommsMessageMock,
}));

const state: {
	// Rows the next select() should return, in FIFO order.
	selectQueue: AnyRow[][];
	insertedThreads: AnyRow[];
	insertedMessages: AnyRow[];
	insertedParticipants: AnyRow[];
	threadReturning: AnyRow[];
	// Row(s) the message insert's `.onConflictDoNothing().returning()` replays.
	// `[]` models a conflict no-op (no new row → no publish).
	messageReturning: AnyRow[];
	conflictHits: number;
} = {
	selectQueue: [],
	insertedThreads: [],
	insertedMessages: [],
	insertedParticipants: [],
	threadReturning: [{ id: "thread-1" }],
	messageReturning: [{ id: "comms-msg-new" }],
	conflictHits: 0,
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

// The fake distinguishes message / participant / thread inserts by columns:
//   message     → has `transport`
//   participant → has `role` (+ userId), no transport
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
			// `.returning()` rows depend on the insert: a message replays
			// messageReturning (so `[]` models a conflict no-op → no publish); a
			// thread replays threadReturning.
			const returningRows =
				kind === "message" ? state.messageReturning : state.threadReturning;
			const chain = {
				onConflictDoNothing: () => {
					if (kind === "message") state.conflictHits += 1;
					return {
						returning: () => Promise.resolve(returningRows),
					};
				},
				returning: () => Promise.resolve(returningRows),
			};
			return chain;
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

const { createMailIngestDb } = await import("./drizzleDb");

const baseArgs = {
	organizationId: "org-1",
	ownerUserId: "user-1",
	fromAddr: "alice@external.com",
	toAddrs: ["mark@rox.one"],
	subject: "Hello",
	snippet: "hi there",
	rfcMessageId: "<shared-msg@external.com>",
	inReplyTo: null,
	mailMessageId: "mail-msg-1",
};

beforeEach(() => {
	state.selectQueue = [];
	state.insertedThreads = [];
	state.insertedMessages = [];
	state.insertedParticipants = [];
	state.threadReturning = [{ id: "thread-1" }];
	state.messageReturning = [{ id: "comms-msg-new" }];
	state.conflictHits = 0;
	publishCommsMessageMock.mockClear();
});

describe("createMailIngestDb.emitToUnifiedInbox (M1)", () => {
	test("first recipient: creates a thread + inserts the comms message", async () => {
		const db = createMailIngestDb();
		state.selectQueue = [
			[], // dup check on (transport, external_id) → none
			[], // sender @rox.one lookup → external sender
			[], // thread by dedup key → none → create
		];
		await db.emitToUnifiedInbox(baseArgs);

		expect(state.insertedThreads).toHaveLength(1);
		expect(state.insertedMessages).toHaveLength(1);
		expect(state.insertedMessages[0]?.transport).toBe("email");
		expect(state.insertedMessages[0]?.externalId).toBe(baseArgs.rfcMessageId);
		// dedup key is a participant-set key, NOT the raw Message-ID.
		expect(state.insertedThreads[0]?.dedupKey).toContain("parts:");

		// FIX 1: the mailbox OWNER is inserted as a comms_participant so the SSE
		// leak-gate forwards + comms.listThreads/getThread surface the email thread.
		// An external sender is NOT a participant (no resolvable rox user).
		expect(state.insertedParticipants).toHaveLength(1);
		expect(state.insertedParticipants[0]?.userId).toBe("user-1");
		expect(state.insertedParticipants[0]?.threadId).toBe("thread-1");
		expect(state.insertedParticipants[0]?.role).toBe("member");

		// Live delivery: a new comms_messages row publishes exactly one SSE event,
		// scoped to the recipient owner with transport=email.
		expect(publishCommsMessageMock).toHaveBeenCalledTimes(1);
		expect(publishCommsMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-1",
				threadId: "thread-1",
				messageId: "comms-msg-new",
				transport: "email",
				participantUserIds: ["user-1"],
			}),
		);
	});

	test("second recipient, same Message-ID: short-circuits, no second message insert (no 500)", async () => {
		const db = createMailIngestDb();
		// The dup-check select finds the comms message the first recipient created.
		state.selectQueue = [
			[{ id: "comms-msg-1" }], // dup check → already exists globally
		];
		await db.emitToUnifiedInbox({ ...baseArgs, ownerUserId: "user-2" });

		// No thread or message insert attempted on the duplicate path.
		expect(state.insertedThreads).toHaveLength(0);
		expect(state.insertedMessages).toHaveLength(0);
		// …and no live event re-pushed for the dedup short-circuit.
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("conflict no-op (concurrent insert lost the race): no live event published", async () => {
		const db = createMailIngestDb();
		state.selectQueue = [
			[], // dup check → none (lost the race)
			[], // sender lookup → external
			[{ id: "thread-existing" }], // thread by dedup → found
		];
		// The message insert hits the unique and `.returning()` yields no row.
		state.messageReturning = [];
		await db.emitToUnifiedInbox(baseArgs);

		expect(state.conflictHits).toBe(1);
		// No NEW row → no SSE event (the other recipient's emit already pushed it).
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("guards the insert with onConflictDoNothing (concurrent race)", async () => {
		const db = createMailIngestDb();
		state.selectQueue = [
			[], // dup check → none (lost the race)
			[], // sender lookup → external
			[{ id: "thread-existing" }], // thread by dedup → found
		];
		await db.emitToUnifiedInbox(baseArgs);
		// The message insert used onConflictDoNothing (so a concurrent insert that
		// slipped past the read-check becomes a no-op instead of a 500).
		expect(state.conflictHits).toBe(1);
	});

	test("resolves a known rox sender to authorUserId", async () => {
		const db = createMailIngestDb();
		state.selectQueue = [
			[], // dup check → none
			[{ userId: "user-bob" }], // sender @rox.one lookup → internal rox user
			[], // thread by dedup → none → create
		];
		await db.emitToUnifiedInbox({ ...baseArgs, fromAddr: "bob@rox.one" });
		expect(state.insertedMessages[0]?.authorUserId).toBe("user-bob");

		// FIX 1: an internal rox→rox email makes BOTH the owner AND the resolved
		// sender participants, so the thread surfaces for both parties.
		const participantUserIds = state.insertedParticipants.map((p) => p.userId);
		expect(participantUserIds).toContain("user-1");
		expect(participantUserIds).toContain("user-bob");
	});

	test("FIX 2: thread find-or-create re-selects the winner on insert conflict", async () => {
		const db = createMailIngestDb();
		// dup→none, sender→external, thread-by-dedup→none (so we attempt an INSERT)…
		state.selectQueue = [
			[], // dup check → none
			[], // sender lookup → external
			[], // thread by dedup → none → attempt insert
			[{ id: "thread-winner" }], // re-select after the insert lost the race
		];
		// …but the thread INSERT's onConflictDoNothing yields no row (a concurrent
		// emit won the (org, dedup_key) unique), forcing the re-select branch.
		state.threadReturning = [];
		await db.emitToUnifiedInbox(baseArgs);

		// The message + participant were attached to the re-selected winner thread,
		// NOT a forked duplicate (no thread id was minted locally).
		expect(state.insertedMessages[0]?.threadId).toBe("thread-winner");
		expect(state.insertedParticipants[0]?.threadId).toBe("thread-winner");
	});
});
