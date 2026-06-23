import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: {
	existing: AnyRow | undefined;
	inserted: AnyRow[];
	updates: { table: string; set: AnyRow }[];
} = {
	existing: undefined,
	inserted: [],
	updates: [],
};

function insertBuilder(table: unknown) {
	const name = TABLES.get(table) ?? "unknown";
	return {
		values(v: AnyRow) {
			state.inserted.push(v);
			const chain = {
				onConflictDoNothing: () => chain,
				returning: () =>
					// [] when the handle already existed (conflict); else the new row.
					Promise.resolve(state.existing ? [] : [{ id: "handle-new" }]),
			};
			return chain;
		},
		_name: name,
	};
}

const fakeTx = {
	insert: (t: unknown) => insertBuilder(t),
	update: (t: unknown) => ({
		set(s: AnyRow) {
			state.updates.push({ table: TABLES.get(t) ?? "unknown", set: s });
			return { where: () => Promise.resolve() };
		},
	}),
	select: () => ({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(state.existing ? [state.existing] : []),
			}),
		}),
	}),
};

mock.module("@rox/db/client", () => ({ db: fakeTx, dbWs: fakeTx }));
const schema = await import("@rox/db/schema");
TABLES.set(schema.identityHandles, "identity_handles");
const { reserveHandle } = await import("./reserveHandle");

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
	state.existing = undefined;
	state.inserted = [];
	state.updates = [];
});

describe("reserveHandle", () => {
	test("creates a new reservation on first claim", async () => {
		const res = await reserveHandle(fakeTx as never, {
			normalizedHandle: "mark",
			userId: USER,
		});
		expect(res.outcome).toBe("created");
		expect(res.handleId).toBe("handle-new");
		expect(state.inserted[0]?.normalizedHandle).toBe("mark");
		expect(state.inserted[0]?.currentOwnerUserId).toBe(USER);
	});

	test("is a no-op when the same user already owns it", async () => {
		state.existing = { id: "h1", currentOwnerUserId: USER };
		const res = await reserveHandle(fakeTx as never, {
			normalizedHandle: "mark",
			userId: USER,
		});
		expect(res.outcome).toBe("owned");
		expect(res.handleId).toBe("h1");
	});

	test("reactivates a self-owned handle on re-claim (rename A→B→A)", async () => {
		// A's row sits in `grace` from a prior rename away; re-claiming it must flip
		// it back to active so the handle is live again.
		state.existing = { id: "h1", currentOwnerUserId: USER, status: "grace" };
		const res = await reserveHandle(fakeTx as never, {
			normalizedHandle: "mark",
			userId: USER,
		});
		expect(res.outcome).toBe("owned");
		const reactivate = state.updates.find(
			(u) => u.table === "identity_handles",
		);
		expect(reactivate?.set.status).toBe("active");
	});

	test("throws CONFLICT when another user owns it (S1 takeover block)", async () => {
		state.existing = { id: "h1", currentOwnerUserId: OTHER };
		await expect(
			reserveHandle(fakeTx as never, {
				normalizedHandle: "mark",
				userId: USER,
			}),
		).rejects.toThrow(/already (taken|reserved)|занято/i);
	});

	test("throws CONFLICT for a freed handle (owner null, still reserved)", async () => {
		state.existing = { id: "h1", currentOwnerUserId: null };
		await expect(
			reserveHandle(fakeTx as never, {
				normalizedHandle: "mark",
				userId: USER,
			}),
		).rejects.toThrow();
	});
});
