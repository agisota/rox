import { describe, expect, test } from "bun:test";
import type { JsonSchema, RoxWorkflowState } from "@rox/workflow-core";
import {
	makeTransformHandler,
	makeVariableSetHandler,
} from "../handlers/dataHandlers";
import { InMemoryRunRecorder } from "./InMemoryRunRecorder";
import type { BlockHandler, ExecuteOptions } from "./types";
import { WorkflowExecutor } from "./WorkflowExecutor";

function state(
	blocks: RoxWorkflowState["blocks"],
	edges: RoxWorkflowState["edges"],
): RoxWorkflowState {
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

	test("RUN-07B: human_approval surfaces subBlocks.approvalMessage on pendingApproval", async () => {
		const wf = state(
			{
				start: { type: "start" },
				approve: {
					type: "human_approval",
					name: "Approve plan",
					subBlocks: { approvalMessage: "Проверьте бюджет перед запуском" },
				},
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
		// The node title is still the block name; the approval message rides alongside.
		expect(r.pendingApproval?.title).toBe("Approve plan");
		expect(r.pendingApproval?.approvalMessage).toBe(
			"Проверьте бюджет перед запуском",
		);
	});

	test("RUN-07C: no approvalMessage → pendingApproval omits it (current behavior)", async () => {
		const wf = state(
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
		const r = await exec.execute(wf, {}, {});
		expect(r.pendingApproval?.approvalMessage).toBeUndefined();
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

	test("RUN-AR-01: agent_run dispatches via resolver and records the session", async () => {
		const wf = state(
			{
				start: { type: "start" },
				improve: {
					type: "agent_run",
					subBlocks: { roleSkillSlug: "prompt-improver" },
				},
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "improve" },
				{ source: "improve", target: "resp" },
			],
		);
		const r = await exec.execute(
			wf,
			{ task: "ship it" },
			{
				initialContext: { seedMessage: "ship it", entries: [] },
				resolveAgentRun: async (req) => {
					expect(req.roleSkillSlug).toBe("prompt-improver");
					expect(req.context.seedMessage).toBe("ship it");
					return {
						output: { message: "improved" },
						appendedContext: [
							{
								nodeId: req.blockId,
								role: "prompt-improver",
								agentId: "rox",
								message: "improved",
								at: "2026-06-17T00:00:00.000Z",
							},
						],
						childRunRef: { kind: "chat", sessionId: "sess_1" },
					};
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(r.output).toEqual({ message: "improved" });
		const step = r.steps.find((s) => s.blockId === "improve");
		expect(step?.status).toBe("succeeded");
		expect(step?.childRunId).toBe("sess_1");
		expect(r.accumulatedContext?.entries).toHaveLength(1);
		expect(r.accumulatedContext?.entries[0]?.message).toBe("improved");
	});

	test("RUN-AR-01B: agent_run resolves the role from subBlocks.roleSlug (editor key)", async () => {
		// The NodeInspector + templates persist `roleSlug`; the executor must read it
		// (legacy fixtures use `roleSkillSlug`, kept as a fallback in RUN-AR-01).
		const wf = state(
			{
				start: { type: "start" },
				improve: {
					type: "agent_run",
					subBlocks: { roleSlug: "prompt-improver" },
				},
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "improve" },
				{ source: "improve", target: "resp" },
			],
		);
		let seenSlug = "";
		const r = await exec.execute(
			wf,
			{ task: "ship it" },
			{
				resolveAgentRun: async (req) => {
					seenSlug = req.roleSkillSlug;
					return { output: { message: "improved" } };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// roleSlug (editor key) resolved onto the request's roleSkillSlug.
		expect(seenSlug).toBe("prompt-improver");
	});

	test("RUN-AR-01C: roleSlug wins over a legacy roleSkillSlug when both present", async () => {
		const wf = state(
			{
				start: { type: "start" },
				improve: {
					type: "agent_run",
					subBlocks: { roleSlug: "new-slug", roleSkillSlug: "legacy-slug" },
				},
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "improve" },
				{ source: "improve", target: "resp" },
			],
		);
		let seenSlug = "";
		await exec.execute(
			wf,
			{},
			{
				resolveAgentRun: async (req) => {
					seenSlug = req.roleSkillSlug;
					return { output: { message: "ok" } };
				},
			},
		);
		expect(seenSlug).toBe("new-slug");
	});

	test("RUN-AR-01D: per-node maxTurns/modelOverride/temperature forward onto the request", async () => {
		const wf = state(
			{
				start: { type: "start" },
				improve: {
					type: "agent_run",
					subBlocks: {
						roleSlug: "critic",
						maxTurns: 17,
						modelOverride: "gpt-5",
						temperature: 0.4,
					},
				},
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "improve" },
				{ source: "improve", target: "resp" },
			],
		);
		let captured: {
			maxTurns?: number;
			modelOverride?: string;
			temperature?: number;
		} = {};
		await exec.execute(
			wf,
			{},
			{
				resolveAgentRun: async (req) => {
					captured = {
						maxTurns: req.maxTurns,
						modelOverride: req.modelOverride,
						temperature: req.temperature,
					};
					return { output: { message: "ok" } };
				},
			},
		);
		expect(captured).toEqual({
			maxTurns: 17,
			modelOverride: "gpt-5",
			temperature: 0.4,
		});
	});

	test("RUN-AR-01E: no overrides → request omits the override fields (current behavior)", async () => {
		const wf = state(
			{
				start: { type: "start" },
				improve: {
					type: "agent_run",
					subBlocks: { roleSlug: "critic" },
				},
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "improve" },
				{ source: "improve", target: "resp" },
			],
		);
		let captured: Record<string, unknown> = {};
		await exec.execute(
			wf,
			{},
			{
				resolveAgentRun: async (req) => {
					captured = {
						maxTurns: req.maxTurns,
						modelOverride: req.modelOverride,
						temperature: req.temperature,
					};
					return { output: { message: "ok" } };
				},
			},
		);
		expect(captured.maxTurns).toBeUndefined();
		expect(captured.modelOverride).toBeUndefined();
		expect(captured.temperature).toBeUndefined();
	});

	test("RUN-AR-02: context accumulates across two agent_run nodes", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "agent_run", subBlocks: { roleSkillSlug: "decomposer" } },
				b: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "b" },
				{ source: "b", target: "resp" },
			],
		);
		const seenBySecond: string[] = [];
		const r = await exec.execute(
			wf,
			{ seed: "x" },
			{
				initialContext: { seedMessage: "x", entries: [] },
				resolveAgentRun: async (req) => {
					// The critic node must see the decomposer's appended entry.
					seenBySecond.push(
						...req.context.entries.map((e) => `${e.role}:${e.message}`),
					);
					const message = `${req.roleSkillSlug}-out`;
					return {
						output: { message },
						appendedContext: [
							{
								nodeId: req.blockId,
								role: req.roleSkillSlug,
								agentId: "rox",
								message,
								at: "2026-06-17T00:00:00.000Z",
							},
						],
					};
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// First node saw nothing; second node saw the first node's output.
		expect(seenBySecond).toEqual(["decomposer:decomposer-out"]);
		expect(r.accumulatedContext?.entries.map((e) => e.role)).toEqual([
			"decomposer",
			"critic",
		]);
	});

	test("RUN-AR-03: agent_run error honors fail_parent vs continue", async () => {
		const mk = (errorMode?: string) =>
			state(
				{
					start: { type: "start" },
					ag: {
						type: "agent_run",
						subBlocks: {
							roleSkillSlug: "critic",
							...(errorMode ? { errorMode } : {}),
						},
					},
					resp: { type: "response" },
				},
				[
					{ source: "start", target: "ag" },
					{ source: "ag", target: "resp" },
				],
			);
		const failing = {
			resolveAgentRun: async () => ({
				error: { code: "AGENT_FAILED", message: "boom" },
				childRunRef: { kind: "chat" as const, sessionId: "c" },
			}),
		};
		const failParent = await exec.execute(mk("fail_parent"), {}, failing);
		expect(failParent.status).toBe("failed");
		expect(failParent.error?.code).toBe("AGENT_FAILED");

		const cont = await exec.execute(mk("continue"), {}, failing);
		expect(cont.status).toBe("succeeded");
		expect(cont.steps.find((s) => s.blockId === "ag")?.status).toBe("failed");
	});

	test("RUN-AR-04: agent_run without a resolver fails the run", async () => {
		const wf = state(
			{
				start: { type: "start" },
				ag: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "ag" },
				{ source: "ag", target: "resp" },
			],
		);
		const r = await exec.execute(wf, {}, {});
		expect(r.status).toBe("failed");
		expect(r.error?.code).toBe("NO_AGENT_RESOLVER");
		expect(r.steps.find((s) => s.blockId === "ag")?.status).toBe("failed");
	});

	test("RUN-AR-05: onAgentRunFinished fires per finished node with output + session", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "agent_run", subBlocks: { roleSkillSlug: "decomposer" } },
				b: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "b" },
				{ source: "b", target: "resp" },
			],
		);
		const finished: {
			blockId: string;
			roleSkillSlug: string;
			output: Record<string, unknown>;
			sessionId?: string;
		}[] = [];
		const r = await exec.execute(
			wf,
			{ seed: "x" },
			{
				initialContext: { seedMessage: "x", entries: [] },
				resolveAgentRun: async (req) => ({
					output: {
						message: `${req.roleSkillSlug}-out`,
						artifacts: [{ kind: "file", ref: `out/${req.blockId}.md` }],
					},
					childRunRef: { kind: "chat", sessionId: `sess_${req.blockId}` },
				}),
				onAgentRunFinished: (info) => {
					finished.push({
						blockId: info.blockId,
						roleSkillSlug: info.roleSkillSlug,
						output: info.output,
						sessionId: info.childRunRef?.sessionId,
					});
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// Both agent_run nodes (a, b) fired the hook in topological order; the
		// terminal `response` node does not.
		expect(finished.map((f) => f.blockId)).toEqual(["a", "b"]);
		expect(finished[0]?.roleSkillSlug).toBe("decomposer");
		expect(finished[0]?.sessionId).toBe("sess_a");
		expect(finished[0]?.output.message).toBe("decomposer-out");
		expect(finished[1]?.output.artifacts).toEqual([
			{ kind: "file", ref: "out/b.md" },
		]);
	});

	test("RUN-AR-06: a throwing onAgentRunFinished never breaks the run", async () => {
		const wf = state(
			{
				start: { type: "start" },
				ag: { type: "agent_run", subBlocks: { roleSkillSlug: "critic" } },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "ag" },
				{ source: "ag", target: "resp" },
			],
		);
		const r = await exec.execute(
			wf,
			{},
			{
				initialContext: { seedMessage: "x", entries: [] },
				resolveAgentRun: async () => ({ output: { message: "ok" } }),
				onAgentRunFinished: () => {
					throw new Error("hook boom");
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(r.steps.find((s) => s.blockId === "ag")?.status).toBe("succeeded");
	});

	// --- Re-entrant loop walk -------------------------------------------------

	/**
	 * critic ⇄ improver feedback loop. The critic always chooses the back-edge
	 * handle ("revise"), so the loop only stops at the iteration cap — proving the
	 * walk is bounded and cannot append context forever.
	 */
	function feedbackLoopState(maxIterations?: number): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				improver: {
					type: "agent_run",
					subBlocks: { roleSkillSlug: "improver" },
				},
				critic: { type: "critic_gate" },
				resp: { type: "response" },
			},
			edges: [
				{ id: "e1", source: "start", target: "improver" },
				{ id: "e2", source: "improver", target: "critic" },
				{
					id: "e_back",
					source: "critic",
					target: "improver",
					sourceHandle: "revise",
				},
				{
					id: "e3",
					source: "critic",
					target: "resp",
					sourceHandle: "accept",
				},
			],
			variables: {},
			loops: { loop1: { nodes: ["improver", "critic"], maxIterations } },
			parallels: {},
			metadata: { name: "feedback" },
		};
	}

	test("RUN-LOOP-01: feedback loop terminates at the iteration cap", async () => {
		let improverRuns = 0;
		// Critic always says "revise" → the loop would run forever without a cap.
		const r = await exec.execute(
			feedbackLoopState(3),
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					critic_gate: () => ({
						handle: "revise",
						output: { verdict: "revise" },
					}),
				},
				resolveAgentRun: async (req) => {
					improverRuns += 1;
					return {
						output: { message: `improved-${improverRuns}` },
						appendedContext: [
							{
								nodeId: req.blockId,
								role: req.roleSkillSlug,
								agentId: "rox",
								message: `improved-${improverRuns}`,
								at: "2026-06-17T00:00:00.000Z",
							},
						],
					};
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// cap=3 ⇒ initial pass + 2 re-entries ⇒ improver runs exactly 3 times.
		expect(improverRuns).toBe(3);
		// Context accumulation is bounded by the cap (one entry per improver run).
		expect(r.accumulatedContext?.entries).toHaveLength(3);
		expect(r.accumulatedContext?.entries.at(-1)?.message).toBe("improved-3");
	});

	test("RUN-LOOP-02: loop exits early when the critic accepts", async () => {
		let improverRuns = 0;
		let criticRuns = 0;
		const r = await exec.execute(
			feedbackLoopState(10),
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					// Revise once, then accept on the 2nd evaluation → 2 improver runs.
					critic_gate: () => {
						criticRuns += 1;
						return criticRuns < 2
							? { handle: "revise", output: { verdict: "revise" } }
							: { handle: "accept", output: { verdict: "accept" } };
					},
				},
				resolveAgentRun: async (req) => {
					improverRuns += 1;
					return {
						output: { message: `improved-${improverRuns}` },
						appendedContext: [
							{
								nodeId: req.blockId,
								role: req.roleSkillSlug,
								agentId: "rox",
								message: `improved-${improverRuns}`,
								at: "2026-06-17T00:00:00.000Z",
							},
						],
					};
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// Exited at cap well before the cap of 10: 2 improver runs, 2 critic runs.
		expect(improverRuns).toBe(2);
		expect(criticRuns).toBe(2);
		expect(r.accumulatedContext?.entries).toHaveLength(2);
	});

	/**
	 * Variant where the iteration cap is NOT declared on `state.loops` (the cap the
	 * executor historically honors) but on a `loop`-type body block's
	 * `subBlocks.maxIterations` — the value the NodeInspector persists. The executor
	 * must bridge that gap and honor the block-level cap when the loops[] cap is
	 * absent (flowToState never copies the subBlock into state.loops).
	 */
	function loopWithBlockCap(blockMaxIterations?: number): RoxWorkflowState {
		return {
			blocks: {
				start: { type: "start" },
				improver: {
					type: "agent_run",
					subBlocks: { roleSlug: "improver" },
				},
				critic: {
					type: "loop",
					subBlocks:
						blockMaxIterations != null
							? { maxIterations: blockMaxIterations }
							: undefined,
				},
				resp: { type: "response" },
			},
			edges: [
				{ id: "e1", source: "start", target: "improver" },
				{ id: "e2", source: "improver", target: "critic" },
				{
					id: "e_back",
					source: "critic",
					target: "improver",
					sourceHandle: "revise",
				},
				{ id: "e3", source: "critic", target: "resp", sourceHandle: "accept" },
			],
			variables: {},
			// No maxIterations here on purpose — the cap lives on the loop block.
			loops: { loop1: { nodes: ["improver", "critic"] } },
			parallels: {},
			metadata: { name: "block-cap" },
		};
	}

	test("RUN-LOOP-BLK-01: loop honors a loop block's subBlocks.maxIterations cap", async () => {
		let improverRuns = 0;
		const r = await exec.execute(
			loopWithBlockCap(2), // cap on the block, not on state.loops
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					loop: () => ({ handle: "revise", output: { verdict: "revise" } }),
				},
				resolveAgentRun: async () => {
					improverRuns += 1;
					return { output: { message: `improved-${improverRuns}` } };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// Block cap=2 ⇒ initial pass + 1 re-entry ⇒ improver runs exactly twice.
		expect(improverRuns).toBe(2);
	});

	test("RUN-LOOP-BLK-02: no block cap + no loops cap → default (5)", async () => {
		let improverRuns = 0;
		const r = await exec.execute(
			loopWithBlockCap(), // neither source set → DEFAULT_MAX_LOOP_ITERATIONS
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					loop: () => ({ handle: "revise" }),
				},
				resolveAgentRun: async () => {
					improverRuns += 1;
					return { output: { message: "x" } };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(improverRuns).toBe(5);
	});

	test("RUN-LOOP-BLK-03: explicit loops[] cap wins over a loop block cap", async () => {
		// Both sources present: the explicit state.loops cap is authoritative.
		const wf = loopWithBlockCap(2);
		wf.loops.loop1 = { nodes: ["improver", "critic"], maxIterations: 4 };
		let improverRuns = 0;
		const r = await exec.execute(
			wf,
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: { loop: () => ({ handle: "revise" }) },
				resolveAgentRun: async () => {
					improverRuns += 1;
					return { output: { message: "x" } };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// loops[] cap (4) wins over the block cap (2).
		expect(improverRuns).toBe(4);
	});

	test("RUN-LOOP-03: default cap bounds a runaway loop (no maxIterations)", async () => {
		let improverRuns = 0;
		const r = await exec.execute(
			feedbackLoopState(), // no maxIterations → DEFAULT_MAX_LOOP_ITERATIONS (5)
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					critic_gate: () => ({ handle: "revise" }),
				},
				resolveAgentRun: async () => {
					improverRuns += 1;
					return { output: { message: "x" } };
				},
			},
		);
		expect(r.status).toBe("succeeded");
		expect(improverRuns).toBe(5);
	});

	test("RUN-LOOP-04: onAgentRunFinished tags the loop iteration (0 on main pass, ≥1 on replays)", async () => {
		// The cross-run dispatcher dedupes loop replays by `iteration`: only the
		// settled (iteration 0) emit should fan out a triggered run. This proves the
		// executor stamps the replay index so a feedback loop can't amplify one
		// finished node into one cross-run dispatch per iteration (design §3.3).
		const iterations: number[] = [];
		const r = await exec.execute(
			feedbackLoopState(3), // initial pass + 2 re-entries
			{ seed: "draft" },
			{
				initialContext: { seedMessage: "draft", entries: [] },
				handlers: {
					critic_gate: () => ({
						handle: "revise",
						output: { verdict: "revise" },
					}),
				},
				resolveAgentRun: async (req) => ({
					output: { message: `improved-${req.blockId}` },
				}),
				onAgentRunFinished: (info) => {
					iterations.push(info.iteration);
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// improver fires the hook 3 times: iteration 0 (main pass), then 1 and 2
		// (the two bounded loop replays). Only the leading 0 should dispatch.
		expect(iterations).toEqual([0, 1, 2]);
	});

	// --- Node-entry dispatch --------------------------------------------------

	test("RUN-ENTRY-01: execution starts at a bound node, skipping upstream", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "step_a" },
				b: { type: "step_b" },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "b" },
				{ source: "b", target: "resp" },
			],
		);
		const ran: string[] = [];
		const r = await exec.execute(
			wf,
			{ injected: "from-trigger" },
			{
				entryNodeId: "b",
				handlers: {
					step_a: () => {
						ran.push("a");
						return { output: { a: 1 } };
					},
					step_b: (ctx) => {
						ran.push("b");
						// `b` is the entry node: it is seeded with the run input.
						return { output: { from: ctx.input.injected, b: 2 } };
					},
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// Upstream `a` never ran; `b` (entry) and `resp` did.
		expect(ran).toEqual(["b"]);
		expect(r.output).toEqual({ from: "from-trigger", b: 2 });
		expect(r.steps.find((s) => s.blockId === "a")).toBeUndefined();
		expect(r.steps.find((s) => s.blockId === "b")?.status).toBe("succeeded");
	});

	test("RUN-ENTRY-02: an unknown entry node id falls back to the start block", async () => {
		const wf = state(
			{
				start: { type: "start" },
				a: { type: "step_a" },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "a" },
				{ source: "a", target: "resp" },
			],
		);
		const r = await exec.execute(
			wf,
			{ x: 1 },
			{
				entryNodeId: "does-not-exist",
				handlers: { step_a: () => ({ output: { a: 1 } }) },
			},
		);
		expect(r.status).toBe("succeeded");
		// Fell back to start: the full graph ran.
		expect(r.steps.find((s) => s.blockId === "a")?.status).toBe("succeeded");
		expect(r.output).toEqual({ a: 1 });
	});

	test("RUN-ENTRY-03: node-entry at an agent_run node accumulates from that node", async () => {
		const wf = state(
			{
				start: { type: "start" },
				pre: { type: "agent_run", subBlocks: { roleSkillSlug: "pre" } },
				target: { type: "agent_run", subBlocks: { roleSkillSlug: "target" } },
				resp: { type: "response" },
			},
			[
				{ source: "start", target: "pre" },
				{ source: "pre", target: "target" },
				{ source: "target", target: "resp" },
			],
		);
		const calledRoles: string[] = [];
		const r = await exec.execute(
			wf,
			{ msg: "go" },
			{
				entryNodeId: "target",
				initialContext: { seedMessage: "go", entries: [] },
				resolveAgentRun: async (req) => {
					calledRoles.push(req.roleSkillSlug);
					return {
						output: { message: `${req.roleSkillSlug}-out` },
						appendedContext: [
							{
								nodeId: req.blockId,
								role: req.roleSkillSlug,
								agentId: "rox",
								message: `${req.roleSkillSlug}-out`,
								at: "2026-06-17T00:00:00.000Z",
							},
						],
					};
				},
			},
		);
		expect(r.status).toBe("succeeded");
		// Only the `target` agent ran; `pre` (upstream of entry) was skipped.
		expect(calledRoles).toEqual(["target"]);
		expect(r.accumulatedContext?.entries.map((e) => e.role)).toEqual([
			"target",
		]);
	});

	test("RUN-DATA-01: variable_set propagates a variable to a downstream node", async () => {
		const wf = state(
			{
				start: { type: "start" },
				setVar: {
					type: "variable_set",
					subBlocks: { key: "total", value: "price * qty" },
				},
				shape: {
					type: "transform",
					subBlocks: { mode: "mapping", mapping: { grandTotal: "total" } },
				},
				response: { type: "response" },
			},
			[
				{ source: "start", target: "setVar" },
				{ source: "setVar", target: "shape" },
				{ source: "shape", target: "response" },
			],
		);
		const recorder = new InMemoryRunRecorder();
		const handlers: Record<string, BlockHandler> = {
			variable_set: makeVariableSetHandler(),
			transform: makeTransformHandler(),
		};
		const result = await exec.execute(
			wf,
			{ price: 10, qty: 4 },
			{ handlers, recorder },
		);
		expect(result.status).toBe("succeeded");
		// `total` was computed in variable_set, threaded as input to transform,
		// and read by the downstream mapping expression.
		expect(result.output).toEqual({ grandTotal: 40 });
	});
});
