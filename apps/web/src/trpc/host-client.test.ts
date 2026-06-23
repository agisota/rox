import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import SuperJSON from "superjson";

// Stub the Next-runtime-coupled dependency modules BEFORE importing the
// module under test so importing `host-client.ts` does not pull in
// `env.ts` validation or `posthog-js`.
mock.module("./auth-token", () => ({
	getAuthToken: () => Promise.resolve("test-token"),
}));
mock.module("./relay-url", () => ({
	getRelayUrl: () => "https://relay.test",
}));

type FetchArgs = { url: string; init: RequestInit | undefined };

let fetchCalls: FetchArgs[] = [];
const originalFetch = globalThis.fetch;

function mockRelayOk(data: unknown): void {
	globalThis.fetch = ((url: string, init?: RequestInit) => {
		fetchCalls.push({ url, init });
		const body = { result: { data: SuperJSON.serialize(data) } };
		return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
	}) as typeof fetch;
}

beforeEach(() => {
	fetchCalls = [];
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("buildHostCallUrl", () => {
	it("encodes GET inputs into the ?input= query param", async () => {
		const { buildHostCallUrl } = await import("./host-client");
		const encoded = SuperJSON.serialize({ workspaceId: "w1" });
		const url = buildHostCallUrl(
			"https://relay.test",
			"org:machine",
			"git.getStatus",
			encoded,
			"GET",
		);
		expect(url.startsWith("https://relay.test/hosts/org:machine/trpc/")).toBe(
			true,
		);
		expect(url).toContain("git.getStatus?input=");
		const inputParam = new URL(url).searchParams.get("input");
		expect(inputParam).not.toBeNull();
		expect(SuperJSON.deserialize(JSON.parse(inputParam as string))).toEqual({
			workspaceId: "w1",
		});
	});

	it("omits the query param for POST", async () => {
		const { buildHostCallUrl } = await import("./host-client");
		const encoded = SuperJSON.serialize({ workspaceId: "w1" });
		const url = buildHostCallUrl(
			"https://relay.test",
			"org:machine",
			"terminal.createSession",
			encoded,
			"POST",
		);
		expect(url).toBe(
			"https://relay.test/hosts/org:machine/trpc/terminal.createSession",
		);
	});
});

describe("RelayTransport / createRelayHostClient", () => {
	it("calls git.getStatus as a GET against the relay host URL", async () => {
		mockRelayOk({ branch: "main", files: [] });
		const { createRelayHostClient } = await import("./host-client");
		const client = createRelayHostClient("org:machine");
		const status = await client.git.getStatus("w1");

		expect(status).toEqual({ branch: "main", files: [] });
		expect(fetchCalls).toHaveLength(1);
		const call = fetchCalls[0];
		expect(call?.url).toContain("/hosts/org:machine/trpc/git.getStatus?input=");
		expect(call?.init?.method).toBe("GET");
		expect((call?.init?.headers as Record<string, string>)?.authorization).toBe(
			"Bearer test-token",
		);
	});

	it("posts terminal.createSession with a SuperJSON body", async () => {
		mockRelayOk({ terminalId: "t1", status: "ok" });
		const { createRelayHostClient } = await import("./host-client");
		const client = createRelayHostClient("org:machine");
		const created = await client.terminal.createSession("w1", {
			initialCommand: "ls",
		});

		expect(created.terminalId).toBe("t1");
		const call = fetchCalls[0];
		expect(call?.init?.method).toBe("POST");
		expect(call?.url).toBe(
			"https://relay.test/hosts/org:machine/trpc/terminal.createSession",
		);
		const decoded = SuperJSON.deserialize(
			JSON.parse(call?.init?.body as string),
		);
		expect(decoded).toEqual({ workspaceId: "w1", initialCommand: "ls" });
	});

	it("routes filesystem.listDirectory through the relay", async () => {
		mockRelayOk({ entries: [] });
		const { createRelayHostClient } = await import("./host-client");
		const client = createRelayHostClient("org:machine");
		await client.filesystem.listDirectory("w1", "src");
		expect(fetchCalls[0]?.url).toContain(
			"/hosts/org:machine/trpc/filesystem.listDirectory?input=",
		);
	});

	it("legacy listHostTerminals still resolves over the relay", async () => {
		mockRelayOk({ sessions: [] });
		const { listHostTerminals } = await import("./host-client");
		const result = await listHostTerminals("org:machine", "w1");
		expect(result.sessions).toEqual([]);
		expect(fetchCalls[0]?.url).toContain(
			"/hosts/org:machine/trpc/terminal.listSessions?input=",
		);
	});

	it("throws on a non-ok relay response", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(new Response("nope", { status: 502 }))) as typeof fetch;
		const { createRelayHostClient } = await import("./host-client");
		const client = createRelayHostClient("org:machine");
		await expect(client.git.getStatus("w1")).rejects.toThrow("502");
	});
});
