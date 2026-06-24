import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * The Drizzle-backed `emitToUnifiedInbox` threads inbound mail on the SAME
 * participant-set dedup key the comms-core router uses (so an email merges with
 * the matching in-app DM), and dedups the inbound copy PER ORG: when the same
 * RFC Message-ID is delivered to two rox recipients in DIFFERENT orgs (the
 * worker POSTs one envelope per recipient), each org gets its OWN
 * thread/message/participant copy — the dedup is scoped to
 * `(organization_id, transport, external_id)`, so recipient #2 is no longer
 * short-circuited out of their unified inbox. A same-owner/same-org redelivery
 * still de-dupes (no duplicate message).
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
	// Column names extracted from each `.where(...)` call, in call order — lets a
	// test assert a SELECT is org-scoped (the dup-check must filter on
	// organization_id, not just transport+external_id) without parsing drizzle's
	// SQL AST shape directly.
	whereColsLog: string[][];
	// The conflict target column names passed to the message insert's
	// `.onConflictDoNothing({ target })`, so a test can assert the arbiter is the
	// org-scoped unique (organization_id, transport, external_id).
	messageConflictTargetCols: string[];
	// How many participant inserts went through `.onConflictDoNothing(...)`, so a
	// test can assert the (thread_id, user_id) attach is idempotency-guarded — a
	// genuine same-owner redelivery must NOT mint a duplicate participant.
	participantConflictGuards: number;
} = {
	selectQueue: [],
	insertedThreads: [],
	insertedMessages: [],
	insertedParticipants: [],
	threadReturning: [{ id: "thread-1" }],
	messageReturning: [{ id: "comms-msg-new" }],
	conflictHits: 0,
	whereColsLog: [],
	messageConflictTargetCols: [],
	participantConflictGuards: 0,
};

/**
 * Pull the column names out of a drizzle `SQL`/column expression (the value
 * passed to `.where(...)` or an `onConflict` `target`). drizzle wraps each column
 * reference in an object carrying `{ name, table }`; SQL conditions nest them in
 * a `queryChunks` array. Walk both so the fake can record which columns a query
 * filters on without coupling to the cyclic SQL internals.
 */
function extractColumnNames(node: unknown): string[] {
	const out: string[] = [];
	const seen = new Set<unknown>();
	const visit = (n: unknown): void => {
		if (!n || typeof n !== "object" || seen.has(n)) return;
		seen.add(n);
		const anyN = n as Record<string, unknown>;
		if (typeof anyN.name === "string" && "table" in anyN) {
			out.push(anyN.name);
		}
		const chunks = anyN.queryChunks;
		if (Array.isArray(chunks)) for (const c of chunks) visit(c);
	};
	if (Array.isArray(node)) for (const n of node) visit(n);
	else visit(node);
	return out;
}

function selectBuilder(rows: AnyRow[]) {
	const step = (): Promise<AnyRow[]> &
		Record<string, (...a: unknown[]) => unknown> => {
		const p = Promise.resolve(rows) as Promise<AnyRow[]> &
			Record<string, (...a: unknown[]) => unknown>;
		p.from = step;
		p.where = (cond: unknown) => {
			state.whereColsLog.push(extractColumnNames(cond));
			return step();
		};
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
				onConflictDoNothing: (opts?: { target?: unknown }) => {
					if (kind === "message") {
						state.conflictHits += 1;
						// Record the arbiter columns so a test can assert the message
						// dedup conflict targets the org-scoped unique.
						if (opts?.target !== undefined) {
							state.messageConflictTargetCols = extractColumnNames(opts.target);
						}
					} else if (kind === "participant") {
						// A participant attach guarded by onConflictDoNothing — count it so a
						// test can assert the (thread_id, user_id) insert is idempotent (a
						// same-owner redelivery never mints a duplicate participant row).
						state.participantConflictGuards += 1;
					}
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
	state.whereColsLog = [];
	state.messageConflictTargetCols = [];
	state.participantConflictGuards = 0;
	publishCommsMessageMock.mockClear();
	resolveIdentityMock.mockClear();
});

/**
 * Find the columns of the inbound dedup SELECT — the `.where(...)` that filters
 * comms_messages by `transport` + `external_id`. Returns its full column-name
 * set so a test can assert it is org-scoped (must also include
 * `organization_id`).
 */
function dupCheckWhereCols(): string[] | undefined {
	return state.whereColsLog.find(
		(cols) => cols.includes("transport") && cols.includes("external_id"),
	);
}

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

		// FIX (per-org dedup): the inbound dup-check SELECT must be org-scoped —
		// it filters on organization_id alongside transport + external_id — so a
		// row another org created for the same Message-ID never short-circuits this
		// org's copy. Backed by the org-scoped unique index.
		expect(dupCheckWhereCols()).toContain("organization_id");
		// And the message insert's conflict arbiter targets the same org-scoped
		// unique (organization_id, transport, external_id), not the old global one.
		expect(state.messageConflictTargetCols).toContain("organization_id");
		expect(state.messageConflictTargetCols).toContain("transport");
		expect(state.messageConflictTargetCols).toContain("external_id");

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

	test("same owner/org redelivery, same Message-ID: short-circuits the message insert + reconciles the owner participant idempotently (no duplicate message/participant/event)", async () => {
		const db = createMailIngestDb();
		// The org-scoped dup-check select finds the comms message THIS owner's org
		// already created (a provider redelivery of the same Message-ID to the same
		// mailbox), and resolves its existing threadId. Re-emitting must NOT insert a
		// second thread/message or re-push a live event.
		state.selectQueue = [
			[{ id: "comms-msg-1", threadId: "thread-existing" }], // org-scoped dup check → exists
			[], // sender @rox.one lookup → external (no internal author)
		];
		await db.emitToUnifiedInbox(baseArgs);

		// No thread or message insert attempted on the duplicate path.
		expect(state.insertedThreads).toHaveLength(0);
		expect(state.insertedMessages).toHaveLength(0);
		// …and no live event re-pushed for the dedup short-circuit.
		expect(publishCommsMessageMock).not.toHaveBeenCalled();

		// The owner participant is STILL reconciled on the existing thread (the attach
		// always runs so every recipient is attached), but it is guarded by
		// onConflictDoNothing on the (thread_id, user_id) partial unique — so a genuine
		// same-owner redelivery is a no-op at the DB and never mints a duplicate
		// participant. The reconcile targets the EXISTING thread, not a forked one.
		const ownerParticipant = state.insertedParticipants.find(
			(p) => p.userId === "user-1",
		);
		expect(ownerParticipant?.threadId).toBe("thread-existing");
		expect(state.participantConflictGuards).toBeGreaterThan(0);
	});

	test("FIX (same-org 2nd recipient): a SECOND rox recipient in the SAME org is attached to the shared thread on the dedup path (exactly ONE comms_message; both owners present as participants)", async () => {
		const db = createMailIngestDb();
		// alice@rox.one + bob@rox.one are BOTH on To: in the SAME org — the most common
		// workspace multi-recipient case. The worker POSTs two envelopes with the SAME
		// organizationId + SAME Message-ID. Recipient #1 (alice) already created the
		// thread+message and added herself. Recipient #2 (bob)'s envelope lands HERE:
		// the org-scoped dup-check finds alice's existing comms_message (same org, same
		// Message-ID) and resolves its threadId. With a bare early-return bob would
		// never be added to comms_participants → isThreadParticipant denies him →
		// listThreads/getThread omit the thread + the SSE gate drops his event. The fix
		// reconciles bob onto the EXISTING shared thread before returning.
		state.selectQueue = [
			[{ id: "comms-msg-alice", threadId: "thread-shared" }], // org dup check → alice's row
			[], // sender @rox.one lookup → external sender (alice is on To:, not From)
		];
		await db.emitToUnifiedInbox({
			...baseArgs,
			ownerUserId: "user-bob",
			toAddrs: ["alice@rox.one", "bob@rox.one"],
		});

		// Dedup: NO second comms_message and NO duplicate thread — there is exactly one
		// copy of the email in this org, shared by both recipients.
		expect(state.insertedMessages).toHaveLength(0);
		expect(state.insertedThreads).toHaveLength(0);

		// …but bob (the current recipient owner) IS now attached to the shared thread as
		// a comms_participant, so recipient #2 is reachable via the participant join —
		// listThreads/getThread surface the thread for him and the SSE gate forwards it.
		const bobParticipant = state.insertedParticipants.find(
			(p) => p.userId === "user-bob",
		);
		expect(bobParticipant).toBeDefined();
		expect(bobParticipant?.threadId).toBe("thread-shared");
		expect(bobParticipant?.organizationId).toBe("org-1");
		expect(bobParticipant?.role).toBe("member");
		// The attach is idempotency-guarded on (thread_id, user_id).
		expect(state.participantConflictGuards).toBeGreaterThan(0);

		// The dedup path re-pushes NO live event (recipient #1's emit already published
		// the message; bob's live delivery is via the shared thread's existing message).
		expect(publishCommsMessageMock).not.toHaveBeenCalled();
	});

	test("FIX (per-org dedup): a SECOND rox recipient in a DIFFERENT org gets their own thread + participant + message (visible in their unified inbox)", async () => {
		const db = createMailIngestDb();
		// Recipient #1 (org-1) already created their copy. Recipient #2 lives in
		// org-2 and the worker POSTs a separate envelope for them with the SAME
		// RFC Message-ID. With the dedup now scoped to (organization_id, transport,
		// external_id), the org-2 dup-check finds NOTHING (recipient #1's row is in
		// org-1), so recipient #2 must get their OWN thread, participant row, and
		// comms_message — otherwise the thread is invisible in their unified inbox
		// (listThreads omits it, getThread FORBIDDEN, SSE gate drops it).
		state.selectQueue = [
			[], // org-scoped dup check (org-2) → none for this org
			[], // sender @rox.one lookup → external sender
			[], // thread by dedup key (org-2) → none → create
		];
		await db.emitToUnifiedInbox({
			...baseArgs,
			organizationId: "org-2",
			ownerUserId: "user-2",
		});

		// Recipient #2 gets their own per-org thread + message.
		expect(state.insertedThreads).toHaveLength(1);
		expect(state.insertedThreads[0]?.organizationId).toBe("org-2");
		expect(state.insertedMessages).toHaveLength(1);
		expect(state.insertedMessages[0]?.organizationId).toBe("org-2");
		expect(state.insertedMessages[0]?.transport).toBe("email");
		expect(state.insertedMessages[0]?.externalId).toBe(baseArgs.rfcMessageId);

		// FIX: recipient #2 (the mailbox owner) is a comms_participant in org-2, so
		// their participant-scoped listThreads/getThread surface the email and the
		// SSE leak-gate forwards it.
		const ownerParticipant = state.insertedParticipants.find(
			(p) => p.userId === "user-2",
		);
		expect(ownerParticipant).toBeDefined();
		expect(ownerParticipant?.organizationId).toBe("org-2");

		// A new row for recipient #2's org → exactly one live SSE event for them.
		expect(publishCommsMessageMock).toHaveBeenCalledTimes(1);
		expect(publishCommsMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-2",
				participantUserIds: ["user-2"],
			}),
		);
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
