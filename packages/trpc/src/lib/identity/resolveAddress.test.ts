import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { rows: AnyRow[] } = { rows: [] };

const fakeDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({ limit: () => Promise.resolve(state.rows) }),
			}),
		}),
	}),
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { resolveAddress } = await import("./resolveAddress");

const USER = "11111111-1111-4111-8111-111111111111";
const AT = new Date("2026-06-23T00:00:00Z");

beforeEach(() => {
	state.rows = [];
});

describe("resolveAddress", () => {
	test("returns null when no address matches", async () => {
		state.rows = [];
		expect(
			await resolveAddress(
				{ kind: "email", value: "x@rox.one", at: AT },
				fakeDb,
			),
		).toBeNull();
	});

	test("resolves a live primary to its owner", async () => {
		state.rows = [
			{ userId: USER, handleId: "h1", isAlias: false, aliasExpiresAt: null },
		];
		const r = await resolveAddress(
			{ kind: "email", value: "mark@rox.one", at: AT },
			fakeDb,
		);
		expect(r?.userId).toBe(USER);
		expect(r?.isAlias).toBe(false);
		expect(r?.expired).toBe(false);
	});

	test("resolves an unexpired alias to its owner", async () => {
		state.rows = [
			{
				userId: USER,
				handleId: "h1",
				isAlias: true,
				aliasExpiresAt: new Date("2026-09-01T00:00:00Z"),
			},
		];
		const r = await resolveAddress(
			{ kind: "email", value: "old@rox.one", at: AT },
			fakeDb,
		);
		expect(r?.userId).toBe(USER);
		expect(r?.expired).toBe(false);
	});

	test("returns null for an EXPIRED alias (bounce, no wrong-owner resolve)", async () => {
		state.rows = [
			{
				userId: USER,
				handleId: "h1",
				isAlias: true,
				aliasExpiresAt: new Date("2026-01-01T00:00:00Z"),
			},
		];
		expect(
			await resolveAddress(
				{ kind: "email", value: "old@rox.one", at: AT },
				fakeDb,
			),
		).toBeNull();
	});
});
