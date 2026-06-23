import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const TABLES = new Map<unknown, string>();
const state: {
	updates: { table: string; set: AnyRow }[];
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
				state.updates.push({ table: name, set: s });
				return {
					where: () => ({ returning: () => Promise.resolve([{ id: "x" }]) }),
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
});
