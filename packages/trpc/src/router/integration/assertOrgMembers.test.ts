import { beforeEach, describe, expect, mock, test } from "bun:test";

type AnyRow = Record<string, unknown>;
const state: { members: AnyRow[] } = { members: [] };
const fakeDb = {
	select: () => ({
		from: () => ({ where: () => Promise.resolve(state.members) }),
	}),
};
mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
const { assertOrgMembers } = await import("./utils");

const ORG = "22222222-2222-4222-8222-222222222222";
const A = "a0000000-0000-4000-8000-000000000000";
const B = "b0000000-0000-4000-8000-000000000000";

beforeEach(() => {
	state.members = [];
});

describe("assertOrgMembers", () => {
	test("passes when every userId is a member", async () => {
		state.members = [{ userId: A }, { userId: B }];
		await expect(assertOrgMembers(ORG, [A, B])).resolves.toBeUndefined();
	});

	test("dedupes and skips empty input", async () => {
		await expect(assertOrgMembers(ORG, [])).resolves.toBeUndefined();
	});

	test("throws FORBIDDEN when any userId is NOT a member (cross-org)", async () => {
		state.members = [{ userId: A }]; // B missing
		await expect(assertOrgMembers(ORG, [A, B])).rejects.toThrow(/member/i);
	});
});
