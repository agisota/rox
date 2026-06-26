import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

// --- deepgramStreamToken auth + gating guard --------------------------------
// Verifies the in-app streaming STT token mint is properly gated:
//   * unauthenticated (no session)  -> UNAUTHORIZED (protectedProcedure)
//   * authenticated non-member      -> FORBIDDEN    (requireActiveOrgMembership)
//   * authenticated active member   -> mints { token, expiresAt }
//   * key unset                     -> FAILED_PRECONDITION (fail-closed)
//
// Pattern mirrors calendar.guard.test.ts: we DON'T mock the deepgram-token
// module — the real mint runs against an injected `fetch`-free path (the
// procedure calls the real lib, which reads process.env + global fetch). To keep
// the success case hermetic we stub global fetch to Deepgram's grant shape and
// set DEEPGRAM_API_KEY. `verifyOrgMembership` is mocked to resolve for the member
// caller and throw FORBIDDEN for the OUTSIDER.

const fakeDb = {
	select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
	query: { members: { findFirst: () => Promise.resolve({ id: "m" }) } },
};

mock.module("@rox/db/client", () => ({ db: fakeDb, dbWs: fakeDb }));
mock.module("../integration/utils", () => ({
	verifyOrgMembership: (userId: string) => {
		if (userId === OUTSIDER) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Not a member of this organization",
			});
		}
		return Promise.resolve({ membership: {} });
	},
	verifyOrgMembershipWithSubscription: () =>
		Promise.resolve({ subscription: null }),
	verifyOrgAdmin: () => Promise.resolve({ membership: {} }),
	verifyOrgOwner: () => Promise.resolve({ membership: {} }),
}));

const { voiceRouter } = await import("./voice");
const { createTRPCRouter, createCallerFactory } = await import("../../trpc");

const appRouter = createTRPCRouter({ voice: voiceRouter });
const createCaller = createCallerFactory(appRouter);

const MEMBER = "11111111-1111-4111-8111-111111111111";
const OUTSIDER = "99999999-9999-4999-8999-999999999999";
const ORG = "22222222-2222-4222-8222-222222222222";
const ACCESS_TOKEN = "eyJhbGci.minted.jwt";

function authedCaller(userId: string, activeOrganizationId: string | null) {
	return createCaller({
		session: {
			user: { id: userId, email: "dev@rox.one" },
			session: { activeOrganizationId },
		},
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

function anonCaller() {
	return createCaller({
		session: null,
		headers: new Headers(),
		// biome-ignore lint/suspicious/noExplicitAny: minimal test ctx
	} as any);
}

let savedKey: string | undefined;
let savedFetch: typeof fetch;

beforeEach(() => {
	savedKey = process.env.DEEPGRAM_API_KEY;
	savedFetch = globalThis.fetch;
});

afterEach(() => {
	if (savedKey === undefined) delete process.env.DEEPGRAM_API_KEY;
	else process.env.DEEPGRAM_API_KEY = savedKey;
	globalThis.fetch = savedFetch;
});

describe("voice.deepgramStreamToken gating", () => {
	test("rejects an unauthenticated caller with UNAUTHORIZED", async () => {
		process.env.DEEPGRAM_API_KEY = "dg-key";
		await expect(anonCaller().voice.deepgramStreamToken()).rejects.toThrow(
			/authenticat/i,
		);
	});

	test("rejects an authenticated NON-member with FORBIDDEN", async () => {
		process.env.DEEPGRAM_API_KEY = "dg-key";
		await expect(
			authedCaller(OUTSIDER, ORG).voice.deepgramStreamToken(),
		).rejects.toThrow(/member/i);
	});

	test("fails closed when the server key is unset", async () => {
		delete process.env.DEEPGRAM_API_KEY;
		await expect(
			authedCaller(MEMBER, ORG).voice.deepgramStreamToken(),
		).rejects.toThrow(/not configured/i);
	});

	test("mints a token for an authenticated active member", async () => {
		process.env.DEEPGRAM_API_KEY = "dg-key";
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({ access_token: ACCESS_TOKEN, expires_in: 300 }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;

		const res = await authedCaller(MEMBER, ORG).voice.deepgramStreamToken();
		expect(res.token).toBe(ACCESS_TOKEN);
		expect(typeof res.expiresAt).toBe("number");
		expect(res.expiresAt).toBeGreaterThan(Date.now());
	});

	test("requires an active organization (no active org -> FORBIDDEN)", async () => {
		process.env.DEEPGRAM_API_KEY = "dg-key";
		await expect(
			authedCaller(MEMBER, null).voice.deepgramStreamToken(),
		).rejects.toThrow(/organization/i);
	});
});
