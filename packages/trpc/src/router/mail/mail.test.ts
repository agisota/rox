import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- DB stub -----------------------------------------------------------------
// Stubs `@rox/db/client` so the suite needs no live database (mirrors the
// comms/dashboard trpc harness). A queue of result-sets drives each `select`;
// inserts/updates record their values and return configured rows.

type AnyRow = Record<string, unknown>;

const state: {
	selectQueue: AnyRow[][];
	inserted: { values: AnyRow[] }[];
	insertReturning: AnyRow[];
	updated: AnyRow[];
	updateReturning: AnyRow[];
	deleteReturning: AnyRow[];
} = {
	selectQueue: [],
	inserted: [],
	insertReturning: [{ id: "new-id" }],
	updated: [],
	updateReturning: [{ id: "msg-1" }],
	deleteReturning: [{ id: "draft-1" }],
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
		p.groupBy = step;
		p.limit = step;
		return p;
	};
	return step();
}

function nextSelect() {
	return selectBuilder(state.selectQueue.shift() ?? []);
}

function insertChain() {
	return {
		values(vals: AnyRow | AnyRow[]) {
			const arr = Array.isArray(vals) ? vals : [vals];
			state.inserted.push({ values: arr });
			const chain = {
				onConflictDoNothing: () => chain,
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
				where: () => {
					const p = Promise.resolve(state.updateReturning) as Promise<
						AnyRow[]
					> & {
						returning: () => Promise<AnyRow[]>;
					};
					p.returning = () => Promise.resolve(state.updateReturning);
					return p;
				},
			};
		},
	};
}

function deleteChain() {
	return {
		where: () => {
			const p = Promise.resolve(state.deleteReturning) as Promise<AnyRow[]> & {
				returning: () => Promise<AnyRow[]>;
			};
			p.returning = () => Promise.resolve(state.deleteReturning);
			return p;
		},
	};
}

const fakeDb = {
	select: () => nextSelect(),
	insert: () => insertChain(),
	update: () => updateChain(),
	delete: () => deleteChain(),
	transaction: <T>(fn: (tx: typeof fakeDb) => Promise<T>) => fn(fakeDb),
	query: {
		roxBalances: {
			findFirst: () => Promise.resolve(state.balanceRow),
		},
	},
} as typeof fakeDb & { query: { roxBalances: { findFirst: () => unknown } } };

// Mutable balance row the economy `ensureBalance` helper reads.
(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
	balanceRox: "500",
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: () => Promise.resolve(),
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
}));

const { mailRouter, setMailSendFnForTest } = await import("./index");
const { setDriveStorageForTest } = await import("../drive/storage");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

// Minimal storage provider stub for the M5 + FN-141 presign procedures.
const fakeStorage = {
	presignGet: async (p: { key: string }) => ({
		url: `https://r2.test/${p.key}?sig=x`,
		expiresAt: new Date(Date.now() + 300_000),
	}),
	presignPut: async (p: { key: string }) => ({
		url: `https://r2.test/${p.key}?put=1&sig=x`,
		expiresAt: new Date(Date.now() + 600_000),
	}),
	// biome-ignore lint/suspicious/noExplicitAny: only presignGet/Put are exercised
} as any;

const appRouter = createTRPCRouter({ mail: mailRouter });
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

beforeEach(() => {
	state.selectQueue = [];
	state.inserted = [];
	state.insertReturning = [{ id: "new-id" }];
	state.updated = [];
	state.updateReturning = [{ id: "msg-1" }];
	state.deleteReturning = [{ id: "draft-1" }];
	(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
		balanceRox: "500",
	};
	setMailSendFnForTest(undefined);
	setDriveStorageForTest(undefined);
});

describe("mail.provisionAddress", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mail.provisionAddress({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("provisions <handle>@rox.one from an explicit handle", async () => {
		state.selectQueue = [
			[], // global reservation lookup → free
		];
		state.insertReturning = [{ id: "addr-1", address: "mark@rox.one" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.provisionAddress({ handle: "Mark" });
		expect(res?.address).toBe("mark@rox.one");
		expect(state.inserted[0]?.values[0]?.address).toBe("mark@rox.one");
	});

	test("refuses an address already reserved by another user", async () => {
		state.selectQueue = [[{ id: "addr-x", userId: "someone-else" }]];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.provisionAddress({ handle: "taken" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("mail.getThread", () => {
	test("404s when the thread is not owned by the caller", async () => {
		state.selectQueue = [[]]; // getOwnedThread → empty
		const caller = callerFor("org-1");
		await expect(
			caller.mail.getThread({ threadId: THREAD_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns thread + messages for the owner", async () => {
		state.selectQueue = [
			[{ id: THREAD_ID, organizationId: "org-1", ownerUserId: "user-1" }],
			[{ id: MSG_ID, subject: "hi" }],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.getThread({ threadId: THREAD_ID });
		expect(res.thread.id).toBe(THREAD_ID);
		expect(res.messages).toHaveLength(1);
	});
});

describe("mail.send", () => {
	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("blocks when the Rox balance is non-positive", async () => {
		(state as unknown as { balanceRow: AnyRow | undefined }).balanceRow = {
			balanceRox: "0",
		};
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("rejects with TOO_MANY_REQUESTS when the per-user send rate is exceeded", async () => {
		setMailSendFnForTest(async () => ({ id: "evt" }));
		state.selectQueue = [
			[{ n: 999 }], // rate-cap count → over the cap
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
	});

	test("fails with PRECONDITION_FAILED when the mailbox is not provisioned", async () => {
		setMailSendFnForTest(async () => ({ id: "evt" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[], // getPrimaryAddress → none
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("blocks a disabled (suppressed) mailbox from sending", async () => {
		setMailSendFnForTest(async () => ({ id: "evt" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "disabled" }],
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("fails with PRECONDITION_FAILED when outbound is not configured", async () => {
		setMailSendFnForTest(null); // simulate no MAIL_OUTBOUND_ENABLED / key
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }],
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({ to: ["a@example.com"], body: "hi" }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("happy path: sends From <handle>@rox.one, persists an outbound row, and debits the ledger", async () => {
		const sent: { from: string; to: string[] }[] = [];
		setMailSendFnForTest(async (payload) => {
			sent.push({ from: payload.from, to: payload.to });
			return { id: "resend-evt-1" };
		});
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }],
		];
		state.insertReturning = [{ id: "out-msg-1" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.send({
			to: ["alice@example.com"],
			subject: "Hi",
			body: "Hello",
		});
		expect(res.messageId).toBe("out-msg-1");
		expect(res.providerId).toBe("resend-evt-1");
		expect(sent[0]?.from).toBe("mark@rox.one");
		expect(sent[0]?.to).toEqual(["alice@example.com"]);
		// An outbound mail_messages row + a mail_send ledger debit were written.
		const outbound = state.inserted.find(
			(i) => i.values[0]?.direction === "outbound",
		)?.values[0];
		expect(outbound?.direction).toBe("outbound");
		expect(outbound?.provider).toBe("resend");
		const ledger = state.inserted.find((i) => i.values[0]?.kind === "mail_send")
			?.values[0];
		expect(ledger?.kind).toBe("mail_send");
		expect(ledger?.deltaRox).toBe("-1");
		// The balance was decremented (the gate is no longer a no-op).
		expect(state.updated.some((u) => "balanceRox" in u)).toBe(true);
		// M6: the outbound mail was emitted into the D1 unified inbox.
		const commsEmit = state.inserted.find(
			(i) =>
				i.values[0]?.transport === "email" &&
				i.values[0]?.direction === "outbound",
		)?.values[0];
		expect(commsEmit).toBeDefined();
		expect(commsEmit?.authorUserId).toBe("user-1");
		// Outbound comms rows carry NO external_id (so they never collide with an
		// inbound RFC Message-ID on the global unique).
		expect(commsEmit?.externalId).toBeNull();

		// FIX 1: the SENDER (mailbox owner) is inserted as a comms_participant so the
		// outbound thread is participant-scoped visible + SSE-forwardable. Identified
		// by a row carrying `role` + the author's userId (no transport column).
		const participantInsert = state.inserted.find(
			(i) =>
				i.values[0]?.role === "member" &&
				i.values[0]?.userId === "user-1" &&
				!("transport" in (i.values[0] ?? {})),
		)?.values;
		expect(participantInsert).toBeDefined();
		expect(participantInsert?.[0]?.userId).toBe("user-1");
	});

	test("FIX 1: an internal rox recipient is added as a thread participant", async () => {
		setMailSendFnForTest(async () => ({ id: "resend-evt-x" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }], // primary
			[], // emitOutbound: thread by dedup → none → create
			[{ userId: "user-bob" }], // resolveRoxRecipientUserIds → internal rox user
		];
		state.insertReturning = [{ id: "out-msg-1" }];
		const caller = callerFor("org-1");
		await caller.mail.send({ to: ["bob@rox.one"], body: "hi bob" });

		// Both the sender (user-1) and the resolved internal recipient (user-bob)
		// become participants, so the conversation surfaces for both parties.
		const participantRows = state.inserted
			.filter((i) => i.values[0]?.role === "member")
			.flatMap((i) => i.values.map((v) => v.userId));
		expect(participantRows).toContain("user-1");
		expect(participantRows).toContain("user-bob");
	});

	test("reply derives References server-side from the parent and bumps message_count", async () => {
		setMailSendFnForTest(async () => ({ id: "resend-evt-2" }));
		const THREAD = "33333333-3333-4333-8333-333333333333";
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }], // primary
			[{ id: THREAD, organizationId: "org-1", ownerUserId: "user-1" }], // getOwnedThread
			[
				{
					rfcMessageId: "<parent@rox.one>",
					inReplyTo: null,
					referencesIds: ["<root@rox.one>"],
				},
			], // parent message
		];
		state.insertReturning = [{ id: "reply-msg-1" }];
		const caller = callerFor("org-1");
		await caller.mail.send({
			to: ["alice@example.com"],
			body: "reply",
			threadId: THREAD,
			// Client lies about references — server must ignore and derive its own.
			references: ["<spoofed@evil.test>"],
		});
		const outbound = state.inserted.find(
			(i) => i.values[0]?.direction === "outbound",
		)?.values[0];
		expect(outbound?.referencesIds).toEqual([
			"<root@rox.one>",
			"<parent@rox.one>",
		]);
		expect(outbound?.inReplyTo).toBe("<parent@rox.one>");
		// message_count bump used a SQL expression on the thread update.
		expect(state.updated.some((u) => "messageCount" in u)).toBe(true);
	});
});

describe("mail.markRead", () => {
	test("404s when no owned message matches", async () => {
		state.updateReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.markRead({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("marks an owned message read", async () => {
		state.updateReturning = [{ id: MSG_ID }];
		const caller = callerFor("org-1");
		const res = await caller.mail.markRead({ messageId: MSG_ID });
		expect(res.ok).toBe(true);
		expect(state.updated[0]?.isRead).toBe(true);
	});
});

describe("mail.getAttachmentUrl (M5)", () => {
	const ATT_ID = "44444444-4444-4444-8444-444444444444";

	test("PRECONDITION_FAILED when storage is unconfigured", async () => {
		setDriveStorageForTest(null);
		const caller = callerFor("org-1");
		await expect(
			caller.mail.getAttachmentUrl({ attachmentId: ATT_ID }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("404s when the attachment is not owned by the caller", async () => {
		setDriveStorageForTest(fakeStorage);
		state.selectQueue = [[]]; // owner-scoped join → none
		const caller = callerFor("org-1");
		await expect(
			caller.mail.getAttachmentUrl({ attachmentId: ATT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns a short-TTL presigned URL for an owned attachment", async () => {
		setDriveStorageForTest(fakeStorage);
		state.selectQueue = [[{ blobKey: "u/user-1/abc", filename: "a.pdf" }]];
		const caller = callerFor("org-1");
		const res = await caller.mail.getAttachmentUrl({ attachmentId: ATT_ID });
		expect(res.url).toContain("u/user-1/abc");
		expect(res.expiresAt).toBeInstanceOf(Date);
	});
});

describe("mail.getBodyUrl (M5)", () => {
	test("404s when the message has no stored body for the variant", async () => {
		setDriveStorageForTest(fakeStorage);
		state.selectQueue = [[{ bodyTextKey: null, bodyHtmlKey: null }]];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.getBodyUrl({ messageId: MSG_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("returns a presigned URL for the text body by default", async () => {
		setDriveStorageForTest(fakeStorage);
		state.selectQueue = [
			[{ bodyTextKey: "u/user-1/body.txt", bodyHtmlKey: "u/user-1/body.html" }],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.getBodyUrl({ messageId: MSG_ID });
		expect(res.url).toContain("body.txt");
	});

	test("returns the html body when variant=html", async () => {
		setDriveStorageForTest(fakeStorage);
		state.selectQueue = [
			[{ bodyTextKey: "u/user-1/body.txt", bodyHtmlKey: "u/user-1/body.html" }],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.getBodyUrl({
			messageId: MSG_ID,
			variant: "html",
		});
		expect(res.url).toContain("body.html");
	});
});

// ===========================================================================
// FN-135 (#697): server folders + ⭐ flag + enriched listThreads
// ===========================================================================

describe("mail.listThreads (FN-135 enriched)", () => {
	test("returns the enriched per-thread summary rows for the owner", async () => {
		state.selectQueue = [
			[
				{
					id: THREAD_ID,
					organizationId: "org-1",
					ownerUserId: "user-1",
					folder: "inbox",
					isFlagged: false,
					unreadCount: 2,
					hasAttachments: true,
					messageCount: 3,
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.listThreads({ limit: 50 });
		expect(res).toHaveLength(1);
		expect(res[0]?.unreadCount).toBe(2);
		expect(res[0]?.hasAttachments).toBe(true);
		expect(res[0]?.folder).toBe("inbox");
	});

	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mail.listThreads({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});
});

describe("mail.setFolder (FN-135)", () => {
	test("moves an owned thread into a folder", async () => {
		state.updateReturning = [{ id: THREAD_ID, folder: "archive" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.setFolder({
			threadId: THREAD_ID,
			folder: "archive",
		});
		expect(res.ok).toBe(true);
		expect(res.folder).toBe("archive");
		expect(state.updated[0]?.folder).toBe("archive");
	});

	test("404s when the thread is not owned by the caller", async () => {
		state.updateReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.setFolder({ threadId: THREAD_ID, folder: "trash" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("mail.setFlag (FN-135)", () => {
	test("toggles the flag (no explicit value) via a SQL NOT expression", async () => {
		state.updateReturning = [{ id: THREAD_ID, isFlagged: true }];
		const caller = callerFor("org-1");
		const res = await caller.mail.setFlag({ threadId: THREAD_ID });
		expect(res.ok).toBe(true);
		expect(res.isFlagged).toBe(true);
		// The update set `isFlagged` to a SQL expression (not a plain boolean).
		expect("isFlagged" in (state.updated[0] ?? {})).toBe(true);
	});

	test("sets an explicit flag value", async () => {
		state.updateReturning = [{ id: THREAD_ID, isFlagged: false }];
		const caller = callerFor("org-1");
		const res = await caller.mail.setFlag({
			threadId: THREAD_ID,
			flagged: false,
		});
		expect(res.isFlagged).toBe(false);
		expect(state.updated[0]?.isFlagged).toBe(false);
	});

	test("404s when the thread is not owned by the caller", async () => {
		state.updateReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.setFlag({ threadId: THREAD_ID, flagged: true }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ===========================================================================
// FN-138 (#698): server-side full-text search
// ===========================================================================

describe("mail.search (FN-138 FTS)", () => {
	test("short-circuits to [] for a whitespace-only query (no DB hit)", async () => {
		const caller = callerFor("org-1");
		const res = await caller.mail.search({ query: "   " });
		expect(res).toEqual([]);
	});

	test("returns [] when no message matches", async () => {
		state.selectQueue = [[]]; // matched thread-ids → none
		const caller = callerFor("org-1");
		const res = await caller.mail.search({ query: "nothing here" });
		expect(res).toEqual([]);
	});

	test("returns enriched thread rows ranked by FTS match order", async () => {
		state.selectQueue = [
			// matched thread ids, best-rank first
			[
				{ threadId: "t-a", score: 0.9 },
				{ threadId: "t-b", score: 0.4 },
			],
			// the enriched thread rows (returned in arbitrary order — proc re-sorts)
			[
				{
					id: "t-b",
					organizationId: "org-1",
					ownerUserId: "user-1",
					folder: "inbox",
					isFlagged: false,
					unreadCount: 0,
					hasAttachments: false,
				},
				{
					id: "t-a",
					organizationId: "org-1",
					ownerUserId: "user-1",
					folder: "inbox",
					isFlagged: true,
					unreadCount: 1,
					hasAttachments: false,
				},
			],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.search({ query: "invoice" });
		// Re-ordered to the FTS rank order (t-a before t-b).
		expect(res.map((r) => r.id)).toEqual(["t-a", "t-b"]);
		expect(res[0]?.isFlagged).toBe(true);
	});

	test("requires an active organization", async () => {
		const caller = callerFor(null);
		await expect(caller.mail.search({ query: "x" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});
});

// ===========================================================================
// FN-139 (#699): server-backed drafts
// ===========================================================================

describe("mail.saveDraft / listDrafts / deleteDraft (FN-139)", () => {
	const DRAFT_ID = "55555555-5555-4555-8555-555555555555";

	test("creates a new draft when no id is supplied", async () => {
		state.insertReturning = [{ id: DRAFT_ID, subject: "Hi" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.saveDraft({ subject: "Hi", body: "draft" });
		expect(res?.id).toBe(DRAFT_ID);
		const inserted = state.inserted[0]?.values[0];
		expect(inserted?.subject).toBe("Hi");
		expect(inserted?.ownerUserId).toBe("user-1");
	});

	test("updates an owned draft in place when an id is supplied", async () => {
		state.updateReturning = [{ id: DRAFT_ID, subject: "Edited" }];
		const caller = callerFor("org-1");
		const res = await caller.mail.saveDraft({
			id: DRAFT_ID,
			subject: "Edited",
		});
		expect(res?.subject).toBe("Edited");
		// An update bumped updated_at and did NOT insert a new row.
		expect("updatedAt" in (state.updated[0] ?? {})).toBe(true);
		expect(state.inserted).toHaveLength(0);
	});

	test("404s when updating a draft the caller does not own", async () => {
		state.updateReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.saveDraft({ id: DRAFT_ID, subject: "x" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("lists the caller's drafts", async () => {
		state.selectQueue = [
			[{ id: DRAFT_ID, subject: "Hi", toAddrs: "a@b.com", attachments: [] }],
		];
		const caller = callerFor("org-1");
		const res = await caller.mail.listDrafts();
		expect(res).toHaveLength(1);
		expect(res[0]?.id).toBe(DRAFT_ID);
	});

	test("deletes an owned draft", async () => {
		state.deleteReturning = [{ id: DRAFT_ID }];
		const caller = callerFor("org-1");
		const res = await caller.mail.deleteDraft({ id: DRAFT_ID });
		expect(res.ok).toBe(true);
	});

	test("404s when deleting a draft the caller does not own", async () => {
		state.deleteReturning = [];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.deleteDraft({ id: DRAFT_ID }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ===========================================================================
// FN-141 (#701): attachment-on-send (presigned PUT + outbound attachments)
// ===========================================================================

describe("mail.presignAttachmentUpload (FN-141)", () => {
	const SHA = "a".repeat(64);

	test("PRECONDITION_FAILED when storage is unconfigured", async () => {
		setDriveStorageForTest(null);
		const caller = callerFor("org-1");
		await expect(
			caller.mail.presignAttachmentUpload({
				filename: "a.pdf",
				contentType: "application/pdf",
				sizeBytes: 1234,
				sha256: SHA,
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("mints an owner-scoped, content-addressed presigned PUT", async () => {
		setDriveStorageForTest(fakeStorage);
		const caller = callerFor("org-1");
		const res = await caller.mail.presignAttachmentUpload({
			filename: "a.pdf",
			contentType: "application/pdf",
			sizeBytes: 1234,
			sha256: SHA,
		});
		// Key is server-derived: mail/outbound/<userId>/<sha256>.
		expect(res.key).toBe(`mail/outbound/user-1/${SHA}`);
		expect(res.url).toContain("put=1");
	});

	test("rejects a non-hex sha256", async () => {
		setDriveStorageForTest(fakeStorage);
		const caller = callerFor("org-1");
		await expect(
			caller.mail.presignAttachmentUpload({
				filename: "a.pdf",
				contentType: "application/pdf",
				sizeBytes: 1234,
				sha256: "not-a-hash",
			}),
		).rejects.toBeDefined();
	});
});

describe("mail.send with attachments (FN-141)", () => {
	const SHA = "b".repeat(64);
	const OWNED_KEY = `mail/outbound/user-1/${SHA}`;

	test("persists mail_attachments + sets hasAttachments for an owned key", async () => {
		setDriveStorageForTest(fakeStorage);
		setMailSendFnForTest(async () => ({ id: "resend-att-1" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }], // primary
		];
		state.insertReturning = [{ id: "out-msg-att" }];
		const caller = callerFor("org-1");
		await caller.mail.send({
			to: ["alice@example.com"],
			subject: "With file",
			body: "see attached",
			attachments: [
				{
					key: OWNED_KEY,
					filename: "a.pdf",
					contentType: "application/pdf",
					sizeBytes: 999,
				},
			],
		});
		// The outbound message row records hasAttachments = true.
		const outbound = state.inserted.find(
			(i) => i.values[0]?.direction === "outbound",
		)?.values[0];
		expect(outbound?.hasAttachments).toBe(true);
		// A mail_attachments row was inserted carrying the R2 blob key.
		const att = state.inserted.find((i) => i.values[0]?.blobKey === OWNED_KEY)
			?.values[0];
		expect(att).toBeDefined();
		expect(att?.filename).toBe("a.pdf");
	});

	test("FORBIDDEN when the attachment key is not owned by the caller", async () => {
		setDriveStorageForTest(fakeStorage);
		setMailSendFnForTest(async () => ({ id: "resend-att-2" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }], // primary
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({
				to: ["alice@example.com"],
				body: "hi",
				attachments: [
					{
						key: "mail/outbound/someone-else/deadbeef",
						filename: "evil.pdf",
						contentType: "application/pdf",
						sizeBytes: 10,
					},
				],
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("PRECONDITION_FAILED when storage is unconfigured but attachments are present", async () => {
		setDriveStorageForTest(null);
		setMailSendFnForTest(async () => ({ id: "resend-att-3" }));
		state.selectQueue = [
			[{ n: 0 }], // rate-cap count
			[{ id: "addr-1", address: "mark@rox.one", status: "active" }], // primary
		];
		const caller = callerFor("org-1");
		await expect(
			caller.mail.send({
				to: ["alice@example.com"],
				body: "hi",
				attachments: [
					{
						key: OWNED_KEY,
						filename: "a.pdf",
						contentType: "application/pdf",
						sizeBytes: 5,
					},
				],
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
});
