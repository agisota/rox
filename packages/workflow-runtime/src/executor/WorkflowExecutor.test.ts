import { describe, expect, test } from "bun:test";
import type { JsonSchema, SupersetWorkflowState } from "@rox/workflow-core";
import { InMemoryRunRecorder } from "./InMemoryRunRecorder";
import type { BlockHandler, ExecuteOptions } from "./types";
import { WorkflowExecutor } from "./WorkflowExecutor";

function state(
	blocks: SupersetWorkflowState["blocks"],
	edges: SupersetWorkflowState["edges"],
): SupersetWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "t" },
	};
}

const exec = new WorkflowExecutor();

describe("WorkflowExecutor", () => {
	test("RUN-01: sequential workflow succeeds and records steps", async () => {
		const wf = state(
			{
				start: { type: "start" },
				make: { type: "create_artifact" },
				response: { type: "response" },
			},
			[
				{ source: "start", target: "make" },
				{ source: "make", target: "response" },
			],
		);
		const recorder = new InMemoryRunRecorder();
		const handlers: Record<string, BlockHandler> = {
			create_artifact: () => ({ output: { artifact_id: "art_1" } }),
		};
		const result = await exec.execute(
			wf,
			{ title: "Report" },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		expect(result.output).toEqual({ artifact_id: "art_1" });
		expect(recorder.steps).toHaveLength(3);
		expect(recorder.steps.every((s) => s.status === "succeeded")).toBe(true);
	});

	const conditionWf = state(
		{
			start: { type: "start" },
			cond: { type: "condition" },
			task: { type: "create_task" },
			resp: { type: "response" },
		},
		[
			{ source: "start", target: "cond" },
			{ source: "cond", target: "task", sourceHandle: "true" },
			{ source: "cond", target: "resp", sourceHandle: "false" },
			{ source: "task", target: "resp" },
		],
	);
	const conditionHandlers = (priorityVar: string): ExecuteOptions => ({
		handlers: {
			condition: (ctx) => ({
				handle: ctx.runInput.priority === priorityVar ? "true" : "false",
			}),
			create_task: () => ({ output: { task_id: "task_1" } }),
		},
	});

	test("RUN-02: condition true branch runs the task", async () => {
		const r = await exec.execute(
			conditionWf,
			{ priority: "high" },
			conditionHandlers("high"),
		);
		expect(r.status).toBe("succeeded");
		expect(r.output).toEqual({ task_id: "task_1" });
		const taskStep = r.steps.find((s) => s.blockId === "task");
		expect(taskStep?.status).toBe("succeeded");
	});

	test("RUN-03: condition false branch skips the task", async () => {
		const r = await exec.execute(
			conditionWf,
			{ priority: "low" },
			conditionHandlers("high"),
		);
		expect(r.status).toBe("succeeded");
		const taskStep = r.steps.find((s) => s.blockId === "task");
		expect(taskStep?.status).toBe("skipped");
	});

	test("RUN-04: parallel branches both run and merge into response", async () => {
		const wf = state(
			{
				start: { type: "start" },
				par: { type: "parallel" },
				risk: { type: "risk_analysis" },
				arch: { type: "architecture_summary" },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "par" },
				{ source: "par", target: "risk" },
				{ source: "par", target: "arch" },
				{ source: "risk", target: "resp" },
				{ source: "arch", target: "resp" },
			],
		);
		const r = await exec.execute(
			wf,
			{},
			{
				handlers: {
					risk_analysis: () => ({ output: { risks: ["r1"] } }),
					architecture_summary: () => ({ output: { summary: "ok" } }),
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(r.output).toEqual({ risks: ["r1"], summary: "ok" });
	});

	test("RUN-05: skill call creates a child run and maps output", async () => {
		const wf = state(
			{
				start: { type: "start" },
				analyze: { type: "skill_call:analyze-repo" },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "analyze" },
				{ source: "analyze", target: "resp" },
			],
		);
		const r = await exec.execute(
			wf,
			{ repo_id: "r" },
			{
				resolveSkillCall: async (slug, input) => {
					expect(slug).toBe("analyze-repo");
					expect(input).toEqual({ repo_id: "r" });
					return { output: { findings: 3 }, childRunId: "run_child" };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(r.output).toEqual({ findings: 3 });
		const step = r.steps.find((s) => s.blockId === "analyze");
		expect(step?.childRunId).toBe("run_child");
	});

	test("RUN-06: child failure propagates (fail_parent) and continues (continue)", async () => {
		const mk = (errorMode?: string) =>
			state(
				{
					start: { type: "start" },
					analyze: {
						type: "skill_call:analyze-repo",
						subBlocks: errorMode ? { errorMode } : undefined,
					},
					resp: { type: "response" },
				},
				[
					{ source: "start", target: "analyze" },
					{ source: "analyze", target: "resp" },
				],
			);
		const failing: ExecuteOptions = {
			resolveSkillCall: async () => ({
				error: { code: "CHILD_FAILED", message: "boom" },
				childRunId: "c",
			}),
		};
		const failParent = await exec.execute(mk("fail_parent"), {}, failing);
		expect(failParent.status).toBe("failed");
		expect(failParent.error?.code).toBe("CHILD_FAILED");

		const cont = await exec.execute(mk("continue"), {}, failing);
		expect(cont.status).toBe("succeeded");
	});

	test("RUN-07: human approval pauses the run", async () => {
		const wf = state(
			{
				start: { type: "start" },
				approve: { type: "human_approval", name: "Approve plan" },
				task: { type: "create_task" },
			},
			[
				{ source: "start", target: "approve" },
				{ source: "approve", target: "task" },
			],
		);
		const r = await exec.execute(wf, {}, {});
		expect(r.status).toBe("waiting_approval");
		expect(r.pendingApproval?.blockId).toBe("approve");
		expect(r.steps.find((s) => s.blockId === "task")).toBeUndefined();
	});

	test("RUN-13: secrets are redacted from recorded step payloads", async () => {
		const wf = state({ start: { type: "start" }, resp: { type: "response" } }, [
			{ source: "start", target: "resp" },
		]);
		const recorder = new InMemoryRunRecorder();
		await exec.execute(
			wf,
			{ token: "supersecret" },
			{ secrets: { GITHUB_TOKEN: "supersecret" }, recorder },
		);
		const json = JSON.stringify(recorder.steps);
		expect(json).not.toContain("supersecret");
		expect(json).toContain("[REDACTED]");
	});

	test("output schema mismatch fails the run", async () => {
		const wf = state({ start: { type: "start" }, resp: { type: "response" } }, [
			{ source: "start", target: "resp" },
		]);
		const outputSchema: JsonSchema = {
			type: "object",
			required: ["task_ids"],
			properties: { task_ids: { type: "array" } },
		};
		const r = await exec.execute(wf, { wrong: 1 }, { outputSchema });
		expect(r.status).toBe("failed");
		expect(r.error?.code).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});

	test("RUN-10: cancellation stops execution", async () => {
		const wf = state(
			{
				start: { type: "start" },
				mid: { type: "create_task" },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "mid" },
				{ source: "mid", target: "resp" },
			],
		);
		const r = await exec.execute(wf, {}, { isCanceled: () => true });
		expect(r.status).toBe("canceled");
	});

	const approvalWf = state(
		{
			start: { type: "start" },
			approve: { type: "human_approval", name: "Approve" },
			task: { type: "create_task" },
		},
		[
			{ source: "start", target: "approve" },
			{ source: "approve", target: "task" },
		],
	);
	const approvalHandlers: ExecuteOptions = {
		handlers: { create_task: () => ({ output: { task_id: "t1" } }) },
	};

	test("RUN-08: approval resumes and runs the gated task", async () => {
		const r = await exec.execute(
			approvalWf,
			{},
			{
				...approvalHandlers,
				approvals: { approve: "approved" },
			},
		);
		expect(r.status).toBe("succeeded");
		expect(r.steps.find((s) => s.blockId === "task")?.status).toBe("succeeded");
	});

	test("RUN-09: rejection prunes the gated write", async () => {
		const r = await exec.execute(
			approvalWf,
			{},
			{
				...approvalHandlers,
				approvals: { approve: "rejected" },
			},
		);
		expect(r.steps.find((s) => s.blockId === "approve")?.status).toBe(
			"canceled",
		);
		expect(r.steps.find((s) => s.blockId === "task")?.status).toBe("skipped");
	});
});
