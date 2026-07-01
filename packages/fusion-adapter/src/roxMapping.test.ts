import { describe, expect, test } from "bun:test";
import type { FusionTask } from "./fusionTypes";
import {
	buildFusionAgentSourceDraft,
	mapFusionColumnToRoxTaskStatus,
	mapFusionRunStatusToRoxRunStatus,
	toRoxFusionStepMirrors,
	toRoxFusionTaskMirror,
} from "./roxMapping";

function task(overrides: Partial<FusionTask> = {}): FusionTask {
	return {
		id: "FN-123",
		title: "Ship adapter",
		description: "Build Fusion adapter",
		column: "in-review",
		currentStep: 0,
		paused: false,
		userPaused: false,
		dependencies: [],
		steps: [{ name: "Review", status: "done" }],
		log: [],
		attachments: [],
		comments: [],
		steeringComments: [],
		workflowStepResults: [],
		customFields: {},
		createdAt: "2026-06-23T10:00:00.000Z",
		updatedAt: "2026-06-23T10:01:00.000Z",
		...overrides,
	};
}

describe("Rox Fusion mapping", () => {
	test("maps Fusion board columns into Rox status semantics", () => {
		expect(mapFusionColumnToRoxTaskStatus("triage")).toBe("backlog");
		expect(mapFusionColumnToRoxTaskStatus("todo")).toBe("todo");
		expect(mapFusionColumnToRoxTaskStatus("in-progress")).toBe("working");
		expect(mapFusionColumnToRoxTaskStatus("in-review")).toBe("ready-to-merge");
		expect(mapFusionColumnToRoxTaskStatus("done")).toBe("completed");
		expect(mapFusionColumnToRoxTaskStatus("archived")).toBe("canceled");
	});

	test("builds a task mirror with provenance and step mirrors", () => {
		const mirror = toRoxFusionTaskMirror(
			task({
				nodeId: "node-local",
				effectiveNodeId: "node-local",
				prInfo: { url: "https://github.com/agisota/rox/pull/1" },
			}),
		);
		const steps = toRoxFusionStepMirrors(task());

		expect(mirror.sourceTaskId).toBe("FN-123");
		expect(mirror.status).toBe("ready-to-merge");
		expect(mirror.prUrl).toContain("github.com/agisota/rox");
		expect(mirror.provenance.nodeId).toBe("node-local");
		expect(steps[0]?.status).toBe("succeeded");
	});

	test("maps run statuses and builds external_http agent source draft", () => {
		expect(mapFusionRunStatusToRoxRunStatus("done")).toBe("succeeded");
		expect(mapFusionRunStatusToRoxRunStatus("in_progress")).toBe("running");

		const draft = buildFusionAgentSourceDraft({
			endpointUrl: "http://127.0.0.1:4040",
			version: "0.45.0",
		});
		expect(draft.kind).toBe("external_http");
		expect(draft.config.provider).toBe("fusion");
		expect(draft.capabilities).toContain("async-agent-run");
	});
});
