import { describe, expect, it } from "bun:test";
import { createHostClient } from "./create-host-client";
import type { HostTarget, HostTransport } from "./types";

const TARGET: HostTarget = {
	routingKey: "org-1:machine-1",
	transport: "relay",
	kind: "local",
};

/** Records every call so tests can assert the factory routes correctly. */
interface RecordedCall {
	procedure: string;
	input: unknown;
	method: "GET" | "POST";
}

function makeRecordingTransport(responses: Record<string, unknown>): {
	transport: HostTransport;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const transport: HostTransport = {
		kind: "relay",
		target: TARGET,
		call<TOutput>(
			procedure: string,
			input: unknown,
			method: "GET" | "POST",
		): Promise<TOutput> {
			calls.push({ procedure, input, method });
			return Promise.resolve(responses[procedure] as TOutput);
		},
	};
	return { transport, calls };
}

describe("HostTransport contract", () => {
	it("a plain object satisfies HostTransport (type round-trip)", () => {
		const transport = {
			kind: "ipc",
			target: { ...TARGET, transport: "ipc" },
			call: <T>() => Promise.resolve(undefined as T),
		} satisfies HostTransport;
		expect(transport.kind).toBe("ipc");
		expect(transport.target.transport).toBe("ipc");
	});
});

describe("createHostClient", () => {
	it("exposes the target and transport it was built from", () => {
		const { transport } = makeRecordingTransport({});
		const client = createHostClient(transport);
		expect(client.target).toEqual(TARGET);
		expect(client.transport).toBe(transport);
	});

	it("routes terminal.listSessions as a GET with the workspaceId", async () => {
		const sessions = [
			{
				terminalId: "t1",
				workspaceId: "w1",
				exited: false,
				title: null,
			},
		];
		const { transport, calls } = makeRecordingTransport({
			"terminal.listSessions": { sessions },
		});
		const client = createHostClient(transport);
		const result = await client.terminal.listSessions("w1");
		expect(result.sessions).toEqual(sessions);
		expect(calls).toEqual([
			{
				procedure: "terminal.listSessions",
				input: { workspaceId: "w1" },
				method: "GET",
			},
		]);
	});

	it("omits initialCommand from createSession when not provided", async () => {
		const { transport, calls } = makeRecordingTransport({
			"terminal.createSession": { terminalId: "t1", status: "ok" },
		});
		const client = createHostClient(transport);
		await client.terminal.createSession("w1");
		expect(calls[0]).toEqual({
			procedure: "terminal.createSession",
			input: { workspaceId: "w1" },
			method: "POST",
		});
	});

	it("includes initialCommand in createSession when provided", async () => {
		const { transport, calls } = makeRecordingTransport({
			"terminal.createSession": { terminalId: "t1", status: "ok" },
		});
		const client = createHostClient(transport);
		await client.terminal.createSession("w1", { initialCommand: "ls" });
		expect(calls[0]?.input).toEqual({
			workspaceId: "w1",
			initialCommand: "ls",
		});
	});

	it("routes git.getStatus and git.getDiff over the transport", async () => {
		const { transport, calls } = makeRecordingTransport({
			"git.getStatus": { branch: "main", files: [] },
			"git.getDiff": { diff: "diff --git" },
		});
		const client = createHostClient(transport);
		const status = await client.git.getStatus("w1");
		const diff = await client.git.getDiff("w1", "a.ts");
		expect(status.branch).toBe("main");
		expect(diff.diff).toContain("diff --git");
		expect(calls.map((c) => c.procedure)).toEqual([
			"git.getStatus",
			"git.getDiff",
		]);
		expect(calls[1]?.input).toEqual({ workspaceId: "w1", path: "a.ts" });
	});

	it("routes filesystem reads with workspace + path", async () => {
		const { transport, calls } = makeRecordingTransport({
			"filesystem.listDirectory": { entries: [] },
			"filesystem.readFile": { contents: "hello" },
		});
		const client = createHostClient(transport);
		await client.filesystem.listDirectory("w1", "src");
		const file = await client.filesystem.readFile("w1", "src/a.ts");
		expect(file.contents).toBe("hello");
		expect(calls[0]?.input).toEqual({ workspaceId: "w1", path: "src" });
		expect(calls[1]?.input).toEqual({ workspaceId: "w1", path: "src/a.ts" });
	});

	it("routes agentConfigs.list with no input", async () => {
		const { transport, calls } = makeRecordingTransport({
			"settings.agentConfigs.list": [],
		});
		const client = createHostClient(transport);
		await client.agentConfigs.list();
		expect(calls[0]).toEqual({
			procedure: "settings.agentConfigs.list",
			input: undefined,
			method: "GET",
		});
	});

	it("routes the D6 host-db read plane through db.query", async () => {
		const rows = [{ id: "1" }];
		const { transport, calls } = makeRecordingTransport({
			"db.query": { rows },
		});
		const client = createHostClient(transport);
		const result = await client.db.query("sessions", { limit: 10 });
		expect(result.rows).toEqual(rows);
		expect(calls[0]).toEqual({
			procedure: "db.query",
			input: { view: "sessions", params: { limit: 10 } },
			method: "GET",
		});
	});
});
