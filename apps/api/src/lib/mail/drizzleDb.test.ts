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
 */

type AnyRow = Record<string, unknown>;

const state: {
	// Rows the next select() should return, in FIFO order.
	selectQueue: AnyRow[][];
	insertedThreads: AnyRow[];
	insertedMessages: AnyRow[];
	threadReturning: AnyRow[];
	conflictHits: number;
} = {
	selectQueue: [],
	insertedThreads: [],
	insertedMessages: [],
	threadReturning: [{ id: "thread-1" }],
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

// The fake distinguishes thread vs message inserts by the columns present.
function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			const row = arr[0] ?? {};
			const isMessage = "transport" in row;
			if (isMessage) {
				state.insertedMessages.push(row);
			} else {
				state.insertedThreads.push(row);
			}
			const chain = {
				onConflictDoNothing: () => {
					state.conflictHits += 1;
					return Promise.resolve([]);
				},
				returning: () => Promise.resolve(state.threadReturning),
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
	state.threadReturning = [{ id: "thread-1" }];
	state.conflictHits = 0;
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
	});
});
