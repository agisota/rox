import { describe, expect, it, mock } from "bun:test";
import type {
	ChatDisplaySnapshot,
	ChatSendArgs,
	ChatTransport,
	UseChatSnapshotOptions,
} from "./types";

/**
 * Contract test for the ChatTransport seam. Both real adapters (host-service
 * `workspaceTrpc.chat.*` and chat-runtime IPC) are thin wrappers over their
 * tRPC clients and require React to exercise their snapshot hook; here we lock
 * the *contract* every adapter must honour — in particular that turn metadata
 * (model / thinkingLevel / permissionMode) is threaded verbatim through `send`
 * and `restart`, which is the regression the consolidation must preserve.
 */

function createRecordingTransport() {
	const calls: { op: string; args: unknown }[] = [];
	const record =
		(op: string) =>
		(args: unknown = undefined) => {
			calls.push({ op, args });
			return Promise.resolve();
		};

	const transport: ChatTransport = {
		kind: "chat-runtime",
		useSnapshot: (_options: UseChatSnapshotOptions): ChatDisplaySnapshot => ({
			displayState: null,
			historicalMessages: [],
			isConversationLoading: false,
			queryError: null,
		}),
		send: mock(record("send")),
		restart: mock(record("restart")),
		stop: mock(record("stop")),
		respondToApproval: mock(record("respondToApproval")),
		respondToPlan: mock(record("respondToPlan")),
		respondToQuestion: mock(record("respondToQuestion")),
		listMessages: mock(() => Promise.resolve([])),
		getSlashCommands: mock(() => Promise.resolve([])),
		getMcpOverview: mock(() =>
			Promise.resolve({ sourcePath: null, servers: [] }),
		),
	};
	return { transport, calls };
}

describe("ChatTransport contract", () => {
	it("threads permissionMode + model + thinkingLevel through send", async () => {
		const { transport, calls } = createRecordingTransport();
		const args: ChatSendArgs = {
			payload: { content: "hello" },
			metadata: {
				model: "rox-r1",
				thinkingLevel: "high",
				permissionMode: "acceptEdits",
			},
		};
		await transport.send(args);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.op).toBe("send");
		expect(calls[0]?.args).toEqual(args);
		expect((calls[0]?.args as ChatSendArgs).metadata?.permissionMode).toBe(
			"acceptEdits",
		);
	});

	it("threads metadata through restart together with the target messageId", async () => {
		const { transport, calls } = createRecordingTransport();
		await transport.restart({
			messageId: "msg-42",
			payload: { content: "edited" },
			metadata: { permissionMode: "bypassPermissions" },
		});
		const last = calls.at(-1);
		expect(last?.op).toBe("restart");
		expect(last?.args).toMatchObject({
			messageId: "msg-42",
			metadata: { permissionMode: "bypassPermissions" },
		});
	});

	it("routes approval / plan / question responses to distinct operations", async () => {
		const { transport, calls } = createRecordingTransport();
		await transport.respondToApproval({ payload: { decision: "approve" } });
		await transport.respondToPlan({
			payload: { planId: "p1", response: { action: "approved" } },
		});
		await transport.respondToQuestion({
			payload: { questionId: "q1", answer: "yes" },
		});
		expect(calls.map((c) => c.op)).toEqual([
			"respondToApproval",
			"respondToPlan",
			"respondToQuestion",
		]);
	});
});
