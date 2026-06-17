import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RoxWorkflowState } from "@rox/workflow-core";

let dbWrites: Array<{ table: unknown; values: unknown }> = [];
const dbWsMock = {
	insert(table: unknown) {
		return {
			values(values: unknown) {
				dbWrites.push({ table, values });
				return {
					returning() {
						return Promise.resolve([{ id: "run-1" }]);
					},
					onConflictDoNothing() {
						return Promise.resolve();
					},
				};
			},
		};
	},
	update(table: unknown) {
		return {
			set(values: unknown) {
				dbWrites.push({ table, values });
				return {
					where() {
						return Promise.resolve();
					},
				};
			},
		};
	},
};

mock.module("@rox/db/client", () => ({ dbWs: dbWsMock }));
mock.module("@rox/db/schema", () => ({
	objectRelations: "objectRelations",
	workflowRunSteps: "workflowRunSteps",
	workflowRuns: "workflowRuns",
}));
mock.module("../../env", () => ({ env: { RELAY_URL: "https://relay.test" } }));
mock.module("./agent-run-events", () => ({
	emitAgentRunFinished: () => undefined,
}));
mock.module("./agent-run-service", () => ({
	makeAgentRunResolver: () => async () => ({ output: { message: "ok" } }),
}));

let executeCalls: unknown[] = [];
mock.module("@rox/workflow-runtime", () => ({
	WorkflowExecutor: class {
		async execute(...args: unknown[]) {
			executeCalls.push(args);
			return { status: "succeeded", steps: [], output: { ok: true } };
		}
	},
}));

const { runPipeline } = await import("./run-pipeline");

const draftState: RoxWorkflowState = {
	blocks: {
		start: { type: "start" },
		target: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
	},
	edges: [{ source: "start", target: "target" }],
};

beforeEach(() => {
	dbWrites = [];
	executeCalls = [];
});

describe("runPipeline node-entry dispatch", () => {
	test("RUNPIPE-ENTRY-01: forwards entryNodeId to the WorkflowExecutor", async () => {
		await runPipeline({
			organizationId: "org-1",
			userId: "user-1",
			pipeline: {
				id: "pipe-1",
				v2ProjectId: "proj-1",
				draftState,
			},
			triggerKind: "agent_run_finished",
			triggerRef: { nodeId: "target" },
			input: { message: "trigger payload" },
			initialContext: { seedMessage: "trigger payload", entries: [] },
			entryNodeId: "target",
		} as Parameters<typeof runPipeline>[0]);

		const [, runInput, options] = executeCalls[0] as [
			RoxWorkflowState,
			Record<string, unknown>,
			{ entryNodeId?: string },
		];
		expect(runInput).toEqual({ message: "trigger payload" });
		expect(options.entryNodeId).toBe("target");
	});
});
