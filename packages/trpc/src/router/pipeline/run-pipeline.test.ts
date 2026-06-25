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

let executeCalls: unknown[] = [];
// Mutable so a test can make the (injected) executor pause for approval and assert
// the run-service threads pendingApproval.approvalMessage through to its result.
let executeResult: Record<string, unknown> = {
	status: "succeeded",
	steps: [],
	output: { ok: true },
};

// Only the LEAF infra boundaries are module-mocked: the DB client (so the
// `workflow_runs` insert/update don't hit Neon), its schema, and the env (for
// `RELAY_URL`). These are inert data/handle stubs. Crucially we do NOT
// `mock.module` `./agent-run-service`, `./agent-run-events`, or
// `@rox/workflow-runtime` here — those are process-global in bun and previously
// leaked into the sibling `agent-run-service` / `agent-run-events` suites,
// causing order-dependent (flaky) failures. Instead they are injected per call
// via `runPipeline(args, deps)` (see `RunPipelineDeps`), keeping the substitution
// local to this suite.
function installModuleMocks() {
	mock.module("@rox/db/client", () => ({ db: dbWsMock, dbWs: dbWsMock }));
	mock.module("../../env", () => ({
		env: { RELAY_URL: "https://relay.test" },
	}));
	// `runPipeline` now imports the REAL `./agent-run-service` (we inject its
	// behaviour via `deps` instead of module-mocking it). That real module pulls in
	// `@rox/auth/server` → `@rox/email`, which validates `NEXT_PUBLIC_MARKETING_URL`
	// at module load and throws in a headless env. Stub those leaf boundaries — none
	// are exercised here since the resolver is injected.
	mock.module("@rox/auth/server", () => ({
		mintUserJwt: async () => "jwt-test-token",
	}));
	mock.module("../automation/relay-client", () => ({
		relayMutation: async () => ({}),
		RelayDispatchError: class extends Error {},
	}));
}

installModuleMocks();

const { runPipeline } = await import("./run-pipeline");
type RunPipelineDeps = Parameters<typeof runPipeline>[1];

// Injected collaborators: a stub resolver, a no-op emit, and a recording
// executor whose `execute` captures its args and returns the mutable
// `executeResult`.
function testDeps(): NonNullable<RunPipelineDeps> {
	return {
		makeAgentRunResolver: () => async () => ({ output: { message: "ok" } }),
		emitAgentRunFinished: () => undefined,
		createExecutor: () => ({
			async execute(...args: unknown[]) {
				executeCalls.push(args);
				return executeResult as never;
			},
		}),
	} as NonNullable<RunPipelineDeps>;
}

const draftState: RoxWorkflowState = {
	blocks: {
		start: { type: "start" },
		// Editor key is `roleSlug` (NodeInspector + templates); the executor reads it
		// with `roleSkillSlug` as a legacy fallback (see WorkflowExecutor RUN-AR-01B).
		target: { type: "agent_run", subBlocks: { roleSlug: "critic" } },
	},
	edges: [{ source: "start", target: "target" }],
};

beforeEach(() => {
	// Re-assert this suite's module mocks so a sibling suite's conflicting global
	// `mock.module(...)` cannot leak in via nondeterministic file load order.
	installModuleMocks();
	dbWrites = [];
	executeCalls = [];
	executeResult = { status: "succeeded", steps: [], output: { ok: true } };
});

describe("runPipeline node-entry dispatch", () => {
	test("RUNPIPE-ENTRY-01: forwards entryNodeId to the WorkflowExecutor", async () => {
		await runPipeline(
			{
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
			} as Parameters<typeof runPipeline>[0],
			testDeps(),
		);

		const [, runInput, options] = executeCalls[0] as [
			RoxWorkflowState,
			Record<string, unknown>,
			{ entryNodeId?: string },
		];
		expect(runInput).toEqual({ message: "trigger payload" });
		expect(options.entryNodeId).toBe("target");
	});

	test("RUNPIPE-APPROVAL-01: surfaces pendingApproval.approvalMessage on the result", async () => {
		// The executor pauses for approval and carries the author's approvalMessage;
		// runPipeline must thread both the block id and the message to its caller so
		// pipeline.runOnce can stamp them on the approval_requests row.
		executeResult = {
			status: "waiting_approval",
			steps: [],
			pendingApproval: {
				blockId: "gate",
				title: "Подтверждение",
				approvalMessage: "Проверьте бюджет перед запуском",
			},
		};
		const result = await runPipeline(
			{
				organizationId: "org-1",
				userId: "user-1",
				pipeline: {
					id: "pipe-1",
					v2ProjectId: "proj-1",
					draftState,
				},
				triggerKind: "manual",
				input: {},
				initialContext: { seedMessage: "", entries: [] },
			} as Parameters<typeof runPipeline>[0],
			testDeps(),
		);

		expect(result.status).toBe("waiting_approval");
		expect(result.approvalBlockId).toBe("gate");
		expect(result.approvalMessage).toBe("Проверьте бюджет перед запуском");
	});
});
