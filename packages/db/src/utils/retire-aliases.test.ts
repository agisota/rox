import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { commsRetired: AnyRow[]; mailRetired: AnyRow[] } = {
	commsRetired: [],
	mailRetired: [],
};
const TABLES = new Map<unknown, string>();

function makeDb() {
	const db: AnyRow = {
		update: (t: unknown) => ({
			set: (s: AnyRow) => ({
				where: () => {
					const name = TABLES.get(t);
					const rows =
						name === "mail_addresses"
							? [{ id: "m1" }]
							: [{ id: "c1" }, { id: "c2" }];
					if (name === "mail_addresses") state.mailRetired.push(s);
					else state.commsRetired.push(s);
					return { returning: () => Promise.resolve(rows) };
				},
			}),
		}),
	};
	return db;
}
const fakeDb = makeDb();
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const schema = await import("../schema");
TABLES.set(schema.commsAddresses, "comms_addresses");
TABLES.set(schema.mailAddresses, "mail_addresses");
const { retireExpiredAliases } = await import("./retire-aliases");

beforeEach(() => {
	state.commsRetired = [];
	state.mailRetired = [];
});

describe("retireExpiredAliases", () => {
	test("disables expired comms aliases and mail grace rows", async () => {
		const res = await retireExpiredAliases(fakeDb as never, {
			at: new Date("2026-06-23T00:00:00Z"),
		});
		expect(res.retired).toBe(3); // 2 comms + 1 mail
		expect(state.commsRetired[0]?.isPrimary).toBe(false);
		expect(state.mailRetired[0]?.status).toBe("disabled");
	});
});
