import { describe, expect, it } from "bun:test";
import { createHostClient } from "./create-host-client";
import {
	createHostWriteClient,
	type HostWriteClient,
} from "./host-write-client";
import type { HostTarget, HostTransport } from "./types";

const TARGET: HostTarget = {
	routingKey: "org-1:machine-1",
	transport: "relay",
	kind: "local",
};

/** Records every call so tests can assert the write factory routes correctly. */
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

describe("createHostWriteClient", () => {
	it("exposes the target and transport it was built from", () => {
		const { transport } = makeRecordingTransport({});
		const client = createHostWriteClient(transport);
		expect(client.target).toEqual(TARGET);
		expect(client.transport).toBe(transport);
	});

	it("routes chat.sendMessage as POST with payload + metadata mapping", async () => {
		const { transport, calls } = makeRecordingTransport({
			"chat.sendMessage": { ok: true },
		});
		const client = createHostWriteClient(transport);
		await client.chat.sendMessage({
			sessionId: "s1",
			workspaceId: "w1",
			content: "hi",
			files: [{ data: "ZGF0YQ==", mediaType: "text/plain", filename: "a.txt" }],
			metadata: { model: "rox", thinkingLevel: "high" },
		});
		// VERIFIED against host chat.ts:57-73 — the host wraps content+files in
		// `payload` and takes `metadata` as a sibling; the wire input must match.
		expect(calls).toEqual([
			{
				procedure: "chat.sendMessage",
				input: {
					sessionId: "s1",
					workspaceId: "w1",
					payload: {
						content: "hi",
						files: [
							{ data: "ZGF0YQ==", mediaType: "text/plain", filename: "a.txt" },
						],
					},
					metadata: { model: "rox", thinkingLevel: "high" },
				},
				method: "POST",
			},
		]);
	});

	it("routes chat.sendMessage with undefined files/metadata when omitted", async () => {
		const { transport, calls } = makeRecordingTransport({
			"chat.sendMessage": { ok: true },
		});
		const client = createHostWriteClient(transport);
		await client.chat.sendMessage({
			sessionId: "s1",
			workspaceId: "w1",
			content: "hi",
		});
		expect(calls[0]).toEqual({
			procedure: "chat.sendMessage",
			input: {
				sessionId: "s1",
				workspaceId: "w1",
				payload: { content: "hi", files: undefined },
				metadata: undefined,
			},
			method: "POST",
		});
	});

	it("routes terminal.write to the host `terminal.writeInput` mutation as POST", async () => {
		const { transport, calls } = makeRecordingTransport({
			"terminal.writeInput": { success: true },
		});
		const client = createHostWriteClient(transport);
		const result = await client.terminal.write({
			terminalId: "t1",
			workspaceId: "w1",
			data: "ls\n",
		});
		expect(result).toEqual({ success: true });
		// VERIFIED against host terminal.ts:137-154 — the procedure is
		// `terminal.writeInput`, NOT `terminal.write`.
		expect(calls).toEqual([
			{
				procedure: "terminal.writeInput",
				input: { terminalId: "t1", workspaceId: "w1", data: "ls\n" },
				method: "POST",
			},
		]);
	});

	it("routes agent.launch to the host `agents.run` mutation as POST", async () => {
		const { transport, calls } = makeRecordingTransport({
			"agents.run": { status: "running", sessionId: "sess-1" },
		});
		const client = createHostWriteClient(transport);
		const result = await client.agent.launch({
			workspaceId: "w1",
			agent: "rox",
			prompt: "do it",
			attachmentIds: ["a1", "a2"],
		});
		expect(result.status).toBe("running");
		// VERIFIED against host agents.ts:299-309.
		expect(calls).toEqual([
			{
				procedure: "agents.run",
				input: {
					workspaceId: "w1",
					agent: "rox",
					prompt: "do it",
					attachmentIds: ["a1", "a2"],
				},
				method: "POST",
			},
		]);
	});

	it("emits exactly one transport.call per write method (1:1 seam)", async () => {
		const { transport, calls } = makeRecordingTransport({
			"chat.sendMessage": {},
			"terminal.writeInput": { success: true },
			"agents.run": { status: "queued" },
		});
		const client = createHostWriteClient(transport);
		await client.chat.sendMessage({
			sessionId: "s1",
			workspaceId: "w1",
			content: "x",
		});
		await client.terminal.write({
			terminalId: "t1",
			workspaceId: "w1",
			data: "x",
		});
		await client.agent.launch({ workspaceId: "w1", agent: "rox", prompt: "x" });
		expect(calls).toHaveLength(3);
		expect(calls.every((c) => c.method === "POST")).toBe(true);
	});
});

describe("frozen read contract is unaffected by the write plane", () => {
	it("the read client still routes its GET reads unchanged", async () => {
		const { transport, calls } = makeRecordingTransport({
			"terminal.listSessions": { sessions: [] },
		});
		// The read factory and write factory share the same transport seam but
		// are independent; building a read client emits only the read call.
		const readClient = createHostClient(transport);
		await readClient.terminal.listSessions("w1");
		expect(calls).toEqual([
			{
				procedure: "terminal.listSessions",
				input: { workspaceId: "w1" },
				method: "GET",
			},
		]);
	});

	it("a HostWriteClient value never widens the read HostClient shape", () => {
		// Typecheck-proof: `createHostClient` stays exhaustive over the FROZEN read
		// namespaces (terminal/git/filesystem/chat/workspace/agentConfigs/db) and
		// the additive write client is a SEPARATE type. If a future edit tried to
		// fold writes into the read client, this construction + the @rox/shared
		// typecheck (read-only `chat` namespace has no `sendMessage`) would break.
		const { transport } = makeRecordingTransport({});
		const writeClient: HostWriteClient = createHostWriteClient(transport);
		const readClient = createHostClient(transport);
		// Read `chat` only lists; write `chat` only sends. Disjoint by design.
		expect(typeof readClient.chat.listMessages).toBe("function");
		expect(typeof writeClient.chat.sendMessage).toBe("function");
		expect("sendMessage" in readClient.chat).toBe(false);
		expect("listMessages" in writeClient.chat).toBe(false);
	});
});
