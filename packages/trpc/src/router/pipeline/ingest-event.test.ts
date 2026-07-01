import { describe, expect, test } from "bun:test";
import type { PipelineEvent } from "@rox/workflow-core";
import { ingestPipelineEvent } from "./ingest-event";

function collector() {
	const events: PipelineEvent[] = [];
	return { events, publish: (e: PipelineEvent) => events.push(e) };
}

describe("ingestPipelineEvent composition", () => {
	test("IE-01: user_sent_message resolves project scope and publishes", async () => {
		const sink = collector();
		const res = await ingestPipelineEvent({
			organizationId: "org-1",
			input: {
				kind: "user_sent_message",
				chatSessionId: "11111111-1111-1111-1111-111111111111",
				message: "Сделай отчёт",
			},
			ports: {
				resolveChatSessionProject: async (org, sessionId) => {
					expect(org).toBe("org-1");
					expect(sessionId).toBe("11111111-1111-1111-1111-111111111111");
					return { v2ProjectId: "proj-1" };
				},
				publish: sink.publish,
			},
		});
		expect(res.published).toBe(true);
		expect(sink.events).toHaveLength(1);
		expect(sink.events[0]).toEqual({
			kind: "user_sent_message",
			organizationId: "org-1",
			v2ProjectId: "proj-1",
			payload: {
				chatSessionId: "11111111-1111-1111-1111-111111111111",
				message: "Сделай отчёт",
			},
		});
	});

	test("IE-02: unknown/foreign chat session → not published, no event fired", async () => {
		const sink = collector();
		const res = await ingestPipelineEvent({
			organizationId: "org-1",
			input: {
				kind: "user_sent_message",
				chatSessionId: "22222222-2222-2222-2222-222222222222",
				message: "hi",
			},
			ports: {
				resolveChatSessionProject: async () => null,
				publish: sink.publish,
			},
		});
		expect(res.published).toBe(false);
		expect(sink.events).toHaveLength(0);
	});

	test("IE-03: workspace-less session publishes an org-wide (null project) event", async () => {
		const sink = collector();
		await ingestPipelineEvent({
			organizationId: "org-1",
			input: {
				kind: "user_sent_message",
				chatSessionId: "33333333-3333-3333-3333-333333333333",
				message: "go",
			},
			ports: {
				resolveChatSessionProject: async () => ({ v2ProjectId: null }),
				publish: sink.publish,
			},
		});
		expect(sink.events[0]?.v2ProjectId).toBeNull();
	});

	test("IE-04: CLI agent_run_finished publishes with the supplied project scope", async () => {
		const sink = collector();
		const res = await ingestPipelineEvent({
			organizationId: "org-1",
			input: {
				kind: "agent_run_finished",
				agentRunRef: {
					kind: "terminal",
					sessionId: "term-1",
					roleSlug: "critic",
					nodeId: "node-a",
				},
				v2ProjectId: "proj-1",
			},
			ports: { publish: sink.publish },
		});
		expect(res.published).toBe(true);
		expect(sink.events[0]).toEqual({
			kind: "agent_run_finished",
			organizationId: "org-1",
			v2ProjectId: "proj-1",
			payload: {
				nodeId: "node-a",
				roleSlug: "critic",
				childSessionId: "term-1",
				childSessionKind: "terminal",
			},
		});
	});

	test("IE-05: CLI agent_run_finished without project → org-wide event", async () => {
		const sink = collector();
		await ingestPipelineEvent({
			organizationId: "org-1",
			input: {
				kind: "agent_run_finished",
				agentRunRef: { kind: "terminal", sessionId: "term-2" },
			},
			ports: { publish: sink.publish },
		});
		expect(sink.events[0]?.v2ProjectId).toBeNull();
		expect(sink.events[0]?.payload.childSessionId).toBe("term-2");
	});
});
