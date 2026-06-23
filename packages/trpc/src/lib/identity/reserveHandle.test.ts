import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: { existing: AnyRow | undefined; inserted: AnyRow[] } = {
	existing: undefined,
	inserted: [],
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
