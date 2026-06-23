import { beforeEach, describe, expect, test } from "bun:test";
import {
	JID_ALIAS_GRACE_MS,
	type ProvisionJidDb,
	provisionJid,
	type XmppAccountRow,
} from "./provisionJid";

// --- In-memory fake db -------------------------------------------------------

interface FakeState {
	accountByUser: Map<string, XmppAccountRow>;
	// `localpart@domain` -> owning userId (live accounts + reserved aliases).
	ownerByLocalpart: Map<string, string>;
	inserts: XmppAccountRow[];
	aliasWrites: {
		accountId: string;
		jidLocalpart: string;
		reservedUntil: Date | null;
	}[];
	renames: { accountId: string; jidLocalpart: string }[];
}

const state: FakeState = {
	accountByUser: new Map(),
	ownerByLocalpart: new Map(),
	inserts: [],
	aliasWrites: [],
	renames: [],
};

const key = (domain: string, localpart: string) => `${localpart}@${domain}`;

const fakeDb: ProvisionJidDb = {
	async findAccountByUser(userId) {
		return state.accountByUser.get(userId) ?? null;
	},
	async findOwnerOfLocalpart({ domain, localpart }) {
		const userId = state.ownerByLocalpart.get(key(domain, localpart));
		return userId ? { userId } : null;
	},
	async insertAccount(row) {
		const account: XmppAccountRow = {
			id: `acct-${row.userId}`,
			status: "active",
			...row,
		};
		state.inserts.push(account);
		state.accountByUser.set(row.userId, account);
		state.ownerByLocalpart.set(key(row.domain, row.jidLocalpart), row.userId);
		return account;
	},
	async updateAccountLocalpart({ accountId, jidLocalpart }) {
		state.renames.push({ accountId, jidLocalpart });
		for (const acct of state.accountByUser.values()) {
			if (acct.id === accountId) {
				acct.jidLocalpart = jidLocalpart;
				state.ownerByLocalpart.set(key(acct.domain, jidLocalpart), acct.userId);
			}
		}
	},
	async insertAlias(row) {
		state.aliasWrites.push(row);
		// The alias keeps the old localpart reserved to the same owner.
		for (const acct of state.accountByUser.values()) {
			if (acct.id === row.accountId) {
				state.ownerByLocalpart.set(
					key(acct.domain, row.jidLocalpart),
					acct.userId,
				);
			}
		}
	},
};

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	state.accountByUser = new Map();
	state.ownerByLocalpart = new Map();
	state.inserts = [];
	state.aliasWrites = [];
	state.renames = [];
});

describe("provisionJid — first provision", () => {
	test("binds <handle>@xmpp.rox.one and reports created", async () => {
		const res = await provisionJid(fakeDb, {
			userId: USER,
			handle: "Alice",
			organizationId: ORG,
		});
		expect(res.outcome).toBe("created");
		expect(res.jid).toBe("alice@xmpp.rox.one");
		expect(res.jidLocalpart).toBe("alice");
		expect(state.inserts).toHaveLength(1);
		expect(state.inserts[0]?.organizationId).toBe(ORG);
	});

	test("respects a domain override", async () => {
		const res = await provisionJid(fakeDb, {
			userId: USER,
			handle: "alice",
			organizationId: ORG,
			domain: "XMPP.Example.Org",
		});
		expect(res.jid).toBe("alice@xmpp.example.org");
	});

	test("rejects an empty / illegal / reserved-infra handle", async () => {
		await expect(
			provisionJid(fakeDb, { userId: USER, handle: "  ", organizationId: ORG }),
		).rejects.toThrow();
		await expect(
			provisionJid(fakeDb, {
				userId: USER,
				handle: "a b",
				organizationId: ORG,
			}),
		).rejects.toThrow();
		await expect(
			provisionJid(fakeDb, {
				userId: USER,
				handle: "bridge",
				organizationId: ORG,
			}),
		).rejects.toThrow();
	});
});

describe("provisionJid — idempotency", () => {
	test("a same-handle re-run is unchanged (no writes)", async () => {
		await provisionJid(fakeDb, {
			userId: USER,
			handle: "alice",
			organizationId: ORG,
		});
		state.inserts = [];
		const res = await provisionJid(fakeDb, {
			userId: USER,
			handle: "alice",
			organizationId: ORG,
		});
		expect(res.outcome).toBe("unchanged");
		expect(state.inserts).toHaveLength(0);
		expect(state.aliasWrites).toHaveLength(0);
		expect(state.renames).toHaveLength(0);
	});
});

describe("provisionJid — rename (DQ4)", () => {
	test("frees the old localpart as a 90-day-grace alias + repoints the account", async () => {
		const now = new Date("2026-06-21T00:00:00.000Z");
		await provisionJid(fakeDb, {
			userId: USER,
			handle: "alice",
			organizationId: ORG,
		});

		const res = await provisionJid(
			fakeDb,
			{ userId: USER, handle: "alicia", organizationId: ORG },
			() => now,
		);

		expect(res.outcome).toBe("renamed");
		expect(res.jid).toBe("alicia@xmpp.rox.one");
		expect(res.previousLocalpart).toBe("alice");

		// One alias row for the OLD localpart, with a 90-day grace.
		expect(state.aliasWrites).toHaveLength(1);
		expect(state.aliasWrites[0]?.jidLocalpart).toBe("alice");
		expect(state.aliasWrites[0]?.reservedUntil?.getTime()).toBe(
			now.getTime() + JID_ALIAS_GRACE_MS,
		);
		// The account now points at the new localpart.
		expect(state.renames[0]?.jidLocalpart).toBe("alicia");
	});

	test("the old localpart stays reserved to the original owner after rename", async () => {
		await provisionJid(fakeDb, {
			userId: USER,
			handle: "alice",
			organizationId: ORG,
		});
		await provisionJid(fakeDb, {
			userId: USER,
			handle: "alicia",
			organizationId: ORG,
		});

		// A different user cannot now claim the freed "alice" localpart (DQ4).
		await expect(
			provisionJid(fakeDb, {
				userId: OTHER,
				handle: "alice",
				organizationId: ORG,
			}),
		).rejects.toThrow(/reserved to another user/);
	});
});

describe("provisionJid — collision", () => {
	test("rejects claiming a localpart owned by another live user", async () => {
		await provisionJid(fakeDb, {
			userId: OTHER,
			handle: "alice",
			organizationId: ORG,
		});
		await expect(
			provisionJid(fakeDb, {
				userId: USER,
				handle: "alice",
				organizationId: ORG,
			}),
		).rejects.toThrow(/reserved to another user/);
	});
});
