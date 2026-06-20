import { beforeEach, describe, expect, mock, test } from "bun:test";

// --- Seams -------------------------------------------------------------------
// The GitHub App install callback (`route.ts`) does five things we want to gate
// without crypto, a DB, GitHub, or QStash:
//   1. verify the signed `state` (forgery protection) — mocked via oauth-state;
//   2. re-verify org membership — mocked via the db `members` query;
//   3. fetch the installation from GitHub — mocked via the octokit app;
//   4. upsert `github_installations` — recorded by the db stub;
//   5. enqueue the initial-sync job on QStash — recorded by `publishJSON`.
//
// The crypto roundtrip for the signed state already has its own unit test
// (`src/lib/oauth-state.test.ts`), so here we mock `verifySignedState` to a
// deterministic valid/invalid result and assert the route's BRANCHING and the
// QStash enqueue shape. Every collaborator the route imports is mocked here.
//
// Leak discipline: we deliberately do NOT call `mock.restore()`. bun's
// `mock.module` registry is process-global and first-registration-wins per
// specifier; restoring mid-run would un-mock `@rox/db/schema` while an already
// linked route module still references it, crashing whichever suite linked first.
// Instead, per-test state is reset in `beforeEach`, and our `@rox/db/schema` mock
// exports the SUPERSET of tables both this suite and the sibling
// `webhook/route.test.ts` need — so the run stays green regardless of which file
// links the shared schema mock first. Run together to prove it:
//   bun test apps/api/src/app/api/github/

type AnyRow = Record<string, unknown>;

const verifyStateMock = mock(
	(_state: string): { organizationId: string; userId: string } | null => ({
		organizationId: "org-1",
		userId: "user-1",
	}),
);
mock.module("@/lib/oauth-state", () => ({
	verifySignedState: verifyStateMock,
}));

// Captured QStash enqueue. The route constructs `new Client({token})` at module
// top-level, so the mock must be in place before the route import below.
const publishJSONMock = mock(async (_payload: unknown) => ({
	messageId: "m-1",
}));
mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSONMock;
	},
}));

// Octokit app: `getInstallationOctokit(id)` -> object with `request(...)`.
const requestMock = mock(async () => ({
	data: {
		id: 12_345,
		account: { login: "acme", type: "Organization" },
		permissions: { contents: "read" },
	},
}));
mock.module("../octokit", () => ({
	githubApp: {
		getInstallationOctokit: async () => ({ request: requestMock }),
	},
}));

// DB stub: `members.findFirst` drives the membership gate;
// `githubInstallations.findFirst` drives the "another org already owns it" gate;
// the insert/upsert records the saved row and returns the generated id.
const state: {
	membership: AnyRow | undefined;
	existingForInstallation: AnyRow | undefined;
	savedInstallation: AnyRow | undefined;
	inserted: AnyRow[];
} = {
	membership: { id: "member-1" },
	existingForInstallation: undefined,
	savedInstallation: { id: "install-db-1" },
	inserted: [],
};

const fakeDb = {
	query: {
		members: { findFirst: () => Promise.resolve(state.membership) },
		githubInstallations: {
			findFirst: () => Promise.resolve(state.existingForInstallation),
		},
	},
	insert: () => ({
		values: (vals: AnyRow) => ({
			onConflictDoUpdate: () => ({
				returning: () => {
					state.inserted.push(vals);
					return Promise.resolve(
						state.savedInstallation ? [state.savedInstallation] : [],
					);
				},
			}),
		}),
	}),
};
mock.module("@rox/db/client", () => ({ db: fakeDb }));
// `mock.module` is process-global AND first-registration-wins per specifier in
// bun: whichever sibling registers `@rox/db/schema` first locks it for every
// later importer. The sibling `webhook/route.test.ts` registers a mock that
// omits `githubInstallations` (its route only needs `webhookEvents`), which would
// break our route's named import if its registration won. We therefore export the
// SUPERSET of every table either route uses — our own (`githubInstallations`,
// `members`) plus the webhook route's `webhookEvents` — so that when this file's
// registration wins (it sorts first in the github dir), every named import across
// both suites still resolves. This is the same defensive superset-export the
// webhook suite documents for its own siblings.
mock.module("@rox/db/schema", () => ({
	githubInstallations: {
		installationId: "installationId",
		organizationId: "organizationId",
	},
	members: { organizationId: "organizationId", userId: "userId" },
	webhookEvents: {
		id: "id",
		provider: "provider",
		eventId: "eventId",
		status: "status",
		retryCount: "retryCount",
		error: "error",
	},
}));

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "qstash-token",
		NEXT_PUBLIC_WEB_URL: "https://web.test",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

const { GET } = await import("./route");

function buildRequest(params: Record<string, string>): Request {
	const url = new URL("https://api.test/api/github/callback");
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return new Request(url, { method: "GET" });
}

function location(res: Response): string {
	return res.headers.get("location") ?? "";
}

describe("github install callback route", () => {
	beforeEach(() => {
		state.membership = { id: "member-1" };
		state.existingForInstallation = undefined;
		state.savedInstallation = { id: "install-db-1" };
		state.inserted = [];

		verifyStateMock.mockClear();
		verifyStateMock.mockImplementation(() => ({
			organizationId: "org-1",
			userId: "user-1",
		}));
		publishJSONMock.mockClear();
		publishJSONMock.mockImplementation(async () => ({ messageId: "m-1" }));
		requestMock.mockClear();
		requestMock.mockImplementation(async () => ({
			data: {
				id: 12_345,
				account: { login: "acme", type: "Organization" },
				permissions: { contents: "read" },
			},
		}));
	});

	test("a valid signed state installs, saves the row, and enqueues initial sync", async () => {
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "good-state" }),
		);

		// Redirects to the success page.
		expect(location(res)).toBe(
			"https://web.test/integrations/github?success=github_installed",
		);

		// The installation row was saved with the verified org/user + account info.
		expect(state.inserted).toHaveLength(1);
		expect(state.inserted[0]).toMatchObject({
			organizationId: "org-1",
			connectedByUserId: "user-1",
			installationId: "12345",
			accountLogin: "acme",
			accountType: "Organization",
		});

		// The initial-sync job was enqueued with the saved db id + org and retries.
		expect(publishJSONMock).toHaveBeenCalledTimes(1);
		const payload = publishJSONMock.mock.calls[0]?.[0] as AnyRow;
		expect(payload.url).toBe("https://api.test/api/github/jobs/initial-sync");
		expect(payload.retries).toBe(3);
		expect(payload.body).toMatchObject({
			installationDbId: "install-db-1",
			organizationId: "org-1",
		});
	});

	test("a tampered/invalid state is rejected before any DB or GitHub call", async () => {
		verifyStateMock.mockImplementation(() => null);
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "tampered" }),
		);

		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=invalid_state",
		);
		// No installation fetched, saved, or enqueued on a forged state.
		expect(requestMock).not.toHaveBeenCalled();
		expect(state.inserted).toHaveLength(0);
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("redirects to cancelled when setup_action=cancel and skips state verification", async () => {
		const res = await GET(
			buildRequest({ setup_action: "cancel", state: "irrelevant" }),
		);
		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=installation_cancelled",
		);
		expect(verifyStateMock).not.toHaveBeenCalled();
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("redirects to missing_params when installation_id is absent", async () => {
		const res = await GET(buildRequest({ state: "good-state" }));
		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=missing_params",
		);
		expect(verifyStateMock).not.toHaveBeenCalled();
	});

	test("rejects with unauthorized when membership re-verification fails", async () => {
		state.membership = undefined;
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "good-state" }),
		);
		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=unauthorized",
		);
		expect(requestMock).not.toHaveBeenCalled();
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("refuses takeover when another org already owns the installation_id", async () => {
		state.existingForInstallation = { id: "other-org-install" };
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "good-state" }),
		);
		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=already_connected",
		);
		expect(state.inserted).toHaveLength(0);
		expect(publishJSONMock).not.toHaveBeenCalled();
	});

	test("warns sync_queue_failed when the QStash enqueue throws", async () => {
		publishJSONMock.mockImplementation(async () => {
			throw new Error("qstash down");
		});
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "good-state" }),
		);
		// The install IS saved, but the user is told the sync queue failed.
		expect(state.inserted).toHaveLength(1);
		expect(location(res)).toBe(
			"https://web.test/integrations/github?warning=sync_queue_failed",
		);
	});

	test("redirects to installation_fetch_failed when GitHub fetch returns null", async () => {
		requestMock.mockImplementation(async () => {
			throw new Error("github 404");
		});
		const res = await GET(
			buildRequest({ installation_id: "12345", state: "good-state" }),
		);
		expect(location(res)).toBe(
			"https://web.test/integrations/github?error=installation_fetch_failed",
		);
		expect(state.inserted).toHaveLength(0);
		expect(publishJSONMock).not.toHaveBeenCalled();
	});
});
