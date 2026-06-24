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

// M1 (external-contact resolution): the inbound worker path resolves an external
// (non-rox) sender to a D6 contact node via the SAME `graphService.resolveIdentity`
// the comms-core `resolveContact` port uses — find-or-create on (org, kind, value).
// We stub `@rox/trpc/graph` (the resolver boundary drizzleDb imports) so the suite
// needs no live graph/db: the stub records each call and replays a stable contact
// id, letting us assert the external message/participant gets `contactEntityId`
// and that the same (org, email) resolves once per emit (idempotent reuse).
const resolveIdentityMock = mock(
	(_tx: unknown, p: { orgId: string; kind: string; value: string }) =>
		Promise.resolve({
			contact: { id: `contact-for:${p.value}` },
			created: true,
		}),
);
mock.module("@rox/trpc/graph", () => ({
	graphService: { resolveIdentity: resolveIdentityMock },
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
	// `resolveContact` runs `graphService.resolveIdentity` inside dbWs.transaction;
	// the resolver itself is stubbed, so the tx body is just `fn(fakeDb)`.
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
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
	resolveIdentityMock.mockClear();
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

		// M1: an external (non-rox) sender resolves-or-creates a D6 contact node and
		// the message is attributed to it (authorContactEntityId), not left unauthored.
		expect(state.insertedMessages[0]?.authorUserId).toBeNull();
		expect(state.insertedMessages[0]?.authorContactEntityId).toBe(
			`contact-for:${baseArgs.fromAddr}`,
		);
		expect(resolveIdentityMock).toHaveBeenCalledTimes(1);
		expect(resolveIdentityMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				orgId: "org-1",
				kind: "email",
				value: baseArgs.fromAddr,
			}),
		);

		// FIX 1: the mailbox OWNER is inserted as a comms_participant so the SSE
		// leak-gate forwards + comms.listThreads/getThread surface the email thread.
		// M1: the external sender is ALSO a participant now — as a contact node
		// (contactEntityId), so the thread shows its external counterpart.
		expect(state.insertedParticipants).toHaveLength(2);
		const ownerParticipant = state.insertedParticipants.find(
			(p) => p.userId === "user-1",
		);
		expect(ownerParticipant?.threadId).toBe("thread-1");
		expect(ownerParticipant?.role).toBe("member");
		const contactParticipant = state.insertedParticipants.find(
			(p) => p.contactEntityId === `contact-for:${baseArgs.fromAddr}`,
		);
		// A contact participant carries no userId (it's an external counterpart).
		expect(contactParticipant?.userId).toBeUndefined();
		expect(contactParticipant?.threadId).toBe("thread-1");

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

		// M1: an INTERNAL rox sender is attributed to its user — contact resolution
		// is the EXTERNAL-only path and must NOT run (no contact node, no FK attr).
		expect(state.insertedMessages[0]?.authorContactEntityId).toBeNull();
		expect(resolveIdentityMock).not.toHaveBeenCalled();

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

		// The message + participants were attached to the re-selected winner thread,
		// NOT a forked duplicate (no thread id was minted locally).
		expect(state.insertedMessages[0]?.threadId).toBe("thread-winner");
		for (const p of state.insertedParticipants) {
			expect(p.threadId).toBe("thread-winner");
		}
	});

	test("M1: same external sender in same org resolves to the SAME contact (idempotent, no duplicate)", async () => {
		const db = createMailIngestDb();

		// First inbound email from alice@external.com.
		state.selectQueue = [
			[], // dup check → none
			[], // sender @rox.one lookup → external
			[], // thread by dedup → none → create
		];
		await db.emitToUnifiedInbox(baseArgs);
		const firstContactId = state.insertedMessages[0]?.authorContactEntityId;

		// Reset captured inserts, then a SECOND, distinct email (new Message-ID) from
		// the SAME external sender in the SAME org. graphService.resolveIdentity is
		// find-or-create on (org, kind, value), so it returns the SAME contact id —
		// no duplicate contact node is forked for the repeat sender.
		state.insertedMessages = [];
		state.insertedParticipants = [];
		state.insertedThreads = [];
		state.selectQueue = [
			[], // dup check → none (different Message-ID)
			[], // sender lookup → external
			[{ id: "thread-existing" }], // thread by dedup → found (same parties)
		];
		await db.emitToUnifiedInbox({
			...baseArgs,
			rfcMessageId: "<second-msg@external.com>",
		});
		const secondContactId = state.insertedMessages[0]?.authorContactEntityId;

		expect(secondContactId).toBe(`contact-for:${baseArgs.fromAddr}`);
		expect(secondContactId).toBe(firstContactId);

		// The contact participant add is idempotent on the (thread, contact) — the
		// emit uses onConflictDoNothing so a repeat sender never duplicates the row.
		const contactParticipant = state.insertedParticipants.find(
			(p) => p.contactEntityId === `contact-for:${baseArgs.fromAddr}`,
		);
		expect(contactParticipant?.contactEntityId).toBe(
			`contact-for:${baseArgs.fromAddr}`,
		);
	});

	test("M1: a repeat external sender on the same thread yields exactly ONE contact participant (find-or-create dedup, no migration)", async () => {
		const db = createMailIngestDb();

		// First inbound email from alice@external.com on a new thread: the contact
		// participant does not exist yet, so it is inserted.
		state.selectQueue = [
			[], // dup check → none
			[], // sender @rox.one lookup → external
			[], // thread by dedup → none → create
			[], // contact-participant find-or-create → none → insert
		];
		await db.emitToUnifiedInbox(baseArgs);
		const firstContactInserts = state.insertedParticipants.filter(
			(p) => p.contactEntityId === `contact-for:${baseArgs.fromAddr}`,
		);
		expect(firstContactInserts).toHaveLength(1);

		// Reset captured inserts, then a SECOND email (new Message-ID) from the SAME
		// external sender threading into the SAME existing thread. The contact
		// participant already exists, so the find-or-create SELECT returns it and the
		// insert is skipped — NO duplicate contact participant row. This is the bug:
		// onConflictDoNothing cannot dedup a contact row (user_id NULL ⇒ no partial
		// unique matches), so without an app-level find-or-create the same external
		// contact re-inserts as a new participant on every repeat email.
		state.insertedParticipants = [];
		state.insertedMessages = [];
		state.insertedThreads = [];
		state.selectQueue = [
			[], // dup check → none (different Message-ID)
			[], // sender lookup → external
			[{ id: "thread-existing" }], // thread by dedup → found (same parties)
			[{ id: "existing-contact-participant" }], // contact participant ALREADY exists
		];
		await db.emitToUnifiedInbox({
			...baseArgs,
			rfcMessageId: "<second-msg@external.com>",
		});

		const contactInsertsAfterSecond = state.insertedParticipants.filter(
			(p) => p.contactEntityId === `contact-for:${baseArgs.fromAddr}`,
		);
		expect(contactInsertsAfterSecond).toHaveLength(0);
	});

	test("M1: contact resolution failure never breaks ingest (best-effort attribution)", async () => {
		const db = createMailIngestDb();
		// The graph resolver throws (e.g. transient db blip). Ingest must still
		// persist the email into the unified inbox — attribution is best-effort, an
		// unresolved sender simply stays unauthored rather than 500-ing the worker.
		resolveIdentityMock.mockImplementationOnce(() => {
			throw new Error("graph unavailable");
		});
		state.selectQueue = [
			[], // dup check → none
			[], // sender lookup → external
			[], // thread by dedup → none → create
		];
		await db.emitToUnifiedInbox(baseArgs);

		expect(state.insertedMessages).toHaveLength(1);
		expect(state.insertedMessages[0]?.authorContactEntityId).toBeNull();
		// Only the mailbox owner remains a participant when the contact didn't resolve.
		expect(state.insertedParticipants).toHaveLength(1);
		expect(state.insertedParticipants[0]?.userId).toBe("user-1");
	});
});
