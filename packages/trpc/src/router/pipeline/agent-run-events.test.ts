import { afterEach, describe, expect, test } from "bun:test";
import {
	clearPipelineEventSink,
	type PipelineEvent,
	setPipelineEventSink,
} from "@rox/workflow-core";
import type { AgentRunFinishedInfo } from "@rox/workflow-runtime";
import { emitAgentRunFinished } from "./agent-run-events";

/**
 * `emitAgentRunFinished` turns an executor `agent_run` completion into the
 * cross-run pipeline events. These tests assert the recursion-guard provenance
 * (`sourceRunId`) and the loop-replay dedupe tag (`iteration`) are stamped onto
 * both the `agent_run_finished` event and each per-artifact
 * `file_or_artifact_created` event — the fields the dispatcher's storm guards
 * rely on (design §3.3).
 */

function captureEvents() {
	const events: PipelineEvent[] = [];
	setPipelineEventSink((e) => {
		events.push(e);
	});
	return events;
}

afterEach(() => {
	clearPipelineEventSink();
});

const scope = {
	organizationId: "org-1",
	v2ProjectId: "proj-1",
	runId: "run-7",
};

describe("emitAgentRunFinished — storm-guard provenance", () => {
	test("ARE-01: stamps sourceRunId + iteration on the agent_run_finished event", () => {
		const events = captureEvents();
		const info: AgentRunFinishedInfo = {
			blockId: "node-a",
			roleSkillSlug: "critic",
			output: { message: "ok" },
			childRunRef: { kind: "chat", sessionId: "sess-1" },
			iteration: 0,
		};
		emitAgentRunFinished(scope, info);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			kind: "agent_run_finished",
			organizationId: "org-1",
			v2ProjectId: "proj-1",
			sourceRunId: "run-7",
			payload: {
				nodeId: "node-a",
				roleSlug: "critic",
				childSessionId: "sess-1",
				iteration: 0,
			},
		});
	});

	test("ARE-02: a loop-replay (iteration ≥ 1) carries the replay index for dedupe", () => {
		const events = captureEvents();
		emitAgentRunFinished(scope, {
			blockId: "improver",
			roleSkillSlug: "improver",
			output: {},
			iteration: 2,
		});
		expect(events[0]?.sourceRunId).toBe("run-7");
		expect(events[0]?.payload.iteration).toBe(2);
	});

	test("ARE-03: each produced artifact event also carries sourceRunId + iteration", () => {
		const events = captureEvents();
		emitAgentRunFinished(scope, {
			blockId: "node-a",
			roleSkillSlug: "writer",
			output: {
				artifacts: [
					{ kind: "file", ref: "out/a.md" },
					{ kind: "file", ref: "out/b.md" },
				],
			},
			iteration: 0,
		});
		// 1 agent_run_finished + 2 file_or_artifact_created.
		expect(events).toHaveLength(3);
		const artifactEvents = events.filter(
			(e) => e.kind === "file_or_artifact_created",
		);
		expect(artifactEvents).toHaveLength(2);
		for (const e of artifactEvents) {
			expect(e.sourceRunId).toBe("run-7");
			expect(e.payload.iteration).toBe(0);
		}
		expect(artifactEvents[0]?.payload.path).toBe("out/a.md");
	});
});
