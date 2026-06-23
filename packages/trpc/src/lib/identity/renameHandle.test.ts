import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: {
	updates: { table: string; set: AnyRow; where: unknown }[];
	inserts: { table: string; values: AnyRow[] }[];
	handleRow: AnyRow | undefined;
} = { updates: [], inserts: [], handleRow: undefined };

function chainFor(table: unknown) {
	const name = TABLES.get(table) ?? "unknown";
	return {
		insert: () => ({
			values(v: AnyRow | AnyRow[]) {
				const arr = Array.isArray(v) ? v : [v];
				state.inserts.push({ table: name, values: arr });
				const c = {
					onConflictDoNothing: () => c,
					returning: () =>
						Promise.resolve(
							name === "identity_handles" && state.handleRow
								? []
								: [{ id: `${name}-new` }],
						),
				};
				return c;
			},
		}),
		update: () => ({
			set(s: AnyRow) {
				const entry: { table: string; set: AnyRow; where: unknown } = {
					table: name,
					set: s,
					where: undefined,
				};
				state.updates.push(entry);
				// `.where()` may be awaited directly (reserveHandle reactivation) or
				// chained with `.returning()` (the alias/mint updates). Capture the
				// predicate so FIX 5's primary-scoped mail alias can be asserted.
				const result = Promise.resolve([{ id: "x" }]) as Promise<AnyRow[]> & {
					returning?: () => Promise<AnyRow[]>;
				};
				result.returning = () => Promise.resolve([{ id: "x" }]);
				return {
					where: (where: unknown) => {
						entry.where = where;
						return result;
					},
				};
			},
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () =>
						Promise.resolve(state.handleRow ? [state.handleRow] : []),
				}),
			}),
		}),
	};
}

const tx = {
	insert: (t: unknown) => chainFor(t).insert(),
	update: (t: unknown) => chainFor(t).update(),
	select: () => chainFor(undefined).select(),
};
const fakeDbWs = {
	transaction: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
};
mock.module("@rox/db/client", () => ({ db: fakeDbWs, dbWs: fakeDbWs }));
const schema = await import("@rox/db/schema");
TABLES.set(schema.identityHandles, "identity_handles");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.mailAddresses, "mail_addresses");
TABLES.set(schema.userProfiles, "user_profiles");
const { renameHandle } = await import("./renameHandle");

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
	state.updates = [];
	state.inserts = [];
	state.handleRow = { id: "h-to", currentOwnerUserId: USER };
});

describe("renameHandle", () => {
	test("aliases old comms + mail addresses with a 90-day grace", async () => {
		await renameHandle({
			userId: USER,
			fromHandle: "old",
			toHandle: "new",
			organizationId: ORG,
		});
		const commsAlias = state.updates.find((u) => u.table === "comms_addresses");
		expect(commsAlias?.set.isAlias).toBe(true);
		expect(commsAlias?.set.aliasExpiresAt).toBeInstanceOf(Date);
		const mailAlias = state.updates.find((u) => u.table === "mail_addresses");
		expect(mailAlias?.set.status).toBe("grace");
	});

	test("mints new primary comms + mail addresses for the new handle", async () => {
		await renameHandle({
			userId: USER,
			fromHandle: "old",
			toHandle: "new",
			organizationId: ORG,
		});
		const comms = state.inserts.find((i) => i.table === "comms_addresses");
		expect(comms?.values.some((v) => v.value === "new@rox.one")).toBe(true);
		const profile = state.updates.find((u) => u.table === "user_profiles");
		expect(profile?.set.handle).toBe("new");
	});

	test("rejects when the target handle is owned by another user (S1)", async () => {
		state.handleRow = { id: "h-to", currentOwnerUserId: "someone-else" };
		await expect(
			renameHandle({
				userId: USER,
				fromHandle: "old",
				toHandle: "new",
				organizationId: ORG,
			}),
		).rejects.toThrow(/занято|taken|reserved/i);
	});

	test("reactivates a re-claimed grace handle (A→B→A leaves A active)", async () => {
		// Renaming back to a handle the user still owns but which sits in `grace`
		// from the previous step: reserveHandle's owned branch must flip it back to
		// active so the re-claimed handle is live again, not stuck in grace.
		state.handleRow = { id: "h-a", currentOwnerUserId: USER, status: "grace" };
		await renameHandle({
			userId: USER,
			fromHandle: "b",
			toHandle: "a",
			organizationId: ORG,
		});
		const reactivate = state.updates.find(
			(u) => u.table === "identity_handles" && u.set.status === "active",
		);
		expect(reactivate).toBeDefined();
	});

	test("scopes the mail alias update to the primary address (FIX 5)", async () => {
		const dialect = new PgDialect();
		await renameHandle({
			userId: USER,
			fromHandle: "old",
			toHandle: "new",
			organizationId: ORG,
		});
		const mailAlias = state.updates.find(
			(u) => u.table === "mail_addresses" && u.set.kind === "alias",
		);
		expect(mailAlias).toBeDefined();
		// The WHERE must guard `kind = 'primary'` so an already-aliased row is never
		// re-aliased (mirrors the comms `is_alias = false` guard).
		// biome-ignore lint/suspicious/noExplicitAny: opaque drizzle SQL node
		const q = dialect.sqlToQuery(mailAlias?.where as any);
		expect(q.sql).toContain('"kind"');
		expect(q.params).toContain("primary");
	});
});
