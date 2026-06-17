import {
	type AccumulatedContext,
	appendContextEntry,
	createAccumulatedContext,
	isSkillCallType,
	loopBackEdgeKeys,
	type ResolvedLoop,
	type RoxEdge,
	type RoxWorkflowState,
	reachableFrom,
	resolveLoops,
	skillSlugFromType,
	stripLoopBackEdges,
	validateGraph,
	validateOutput,
} from "@rox/workflow-core";
import { Redactor } from "../context/Redactor";
import type {
	AgentRunRequest,
	BlockHandler,
	BlockHandlerContext,
	ExecuteOptions,
	RunResult,
	StepRecord,
} from "./types";

/**
 * Default and hard caps on loop-body iterations for feedback loops
 * (critic → improver). The re-entrant loop walk in `execute` bounds each loop
 * body by `resolveLoopIterationCap(...)`, so a feedback loop cannot re-enter —
 * or append context — forever.
 */
export const DEFAULT_MAX_LOOP_ITERATIONS = 5;
export const MAX_LOOP_ITERATIONS = 20;

/** Clamp a configured loop cap into the supported `[1, MAX_LOOP_ITERATIONS]` range. */
export function resolveLoopIterationCap(maxIterations?: number): number {
	if (maxIterations == null || !Number.isFinite(maxIterations)) {
		return DEFAULT_MAX_LOOP_ITERATIONS;
	}
	const floored = Math.floor(maxIterations);
	if (floored < 1) return 1;
	if (floored > MAX_LOOP_ITERATIONS) return MAX_LOOP_ITERATIONS;
	return floored;
}

/** Built-in handlers used when a block type has no injected handler. */
function builtinHandlers(): Record<string, BlockHandler> {
	return {
		start: (ctx) => ({ output: ctx.runInput }),
		response: (ctx) => ({ output: ctx.input }),
	};
}

function mergeInputs(
	outputs: Record<string, unknown>[],
): Record<string, unknown> {
	return Object.assign({}, ...outputs);
}

/**
 * Executes a workflow graph as a topological linearization with conditional
 * branch pruning. A block runs only when an upstream edge "fires" into it
 * (respecting the source's chosen output handle), so condition/switch branches
 * skip the untaken path while joins (parallel merge) wait for every live input.
 *
 * Stateless and DB-free: persistence, host calls, and secrets arrive via
 * injected ports (`recorder`, `handlers`, `resolveSkillCall`, `secrets`).
 */
export class WorkflowExecutor {
	async execute(
		state: RoxWorkflowState,
		runInput: Record<string, unknown>,
		options: ExecuteOptions = {},
	): Promise<RunResult> {
		const steps: StepRecord[] = [];
		const redactor = new Redactor(options.secrets);
		const handlers = { ...builtinHandlers(), ...(options.handlers ?? {}) };
		const resolveSecret = (key: string) => options.secrets?.[key];

		// Accumulating context (message + transcript) threaded into agent_run nodes.
		// Seeded from initialContext; each agent_run appends its output (design §5).
		let runContext: AccumulatedContext =
			options.initialContext ?? createAccumulatedContext("");
		// True once an agent_run executed (or a seed was supplied) so we only attach
		// accumulatedContext to the result when pipelines are actually in play.
		let contextTouched = options.initialContext != null;

		// Re-entrant loop execution. Feedback loops (e.g. critic → improver) live in
		// `state.loops`; their back-edge (the edge re-entering the loop entry) is what
		// would make the graph cyclic. We strip those back-edges so the forward graph
		// validates + plans as a DAG, then walk each loop body a bounded number of
		// times (the cap from `resolveLoopIterationCap`) once the main pass completes.
		const loops = resolveLoops(state);
		const backEdgeKeys = loopBackEdgeKeys(loops);
		const planState = stripLoopBackEdges(state, backEdgeKeys);

		const record = async (step: StepRecord): Promise<void> => {
			const redacted: StepRecord = {
				...step,
				input: step.input ? redactor.redact(step.input) : undefined,
				output: step.output ? redactor.redact(step.output) : undefined,
			};
			steps.push(redacted);
			await options.recorder?.recordStep(redacted);
		};

		const validation = validateGraph(planState);
		if (!validation.valid || !validation.executionPlan) {
			return {
				status: "failed",
				steps,
				error: {
					code: "INVALID_GRAPH",
					message: "Workflow graph is invalid",
					details: { issues: validation.issues },
				},
			};
		}

		// Node-entry dispatch: a trigger may start the run AT a specific node
		// instead of `start`. Resolve the seed node, then restrict the plan to the
		// nodes reachable from it (on the back-edge-stripped graph) so upstream
		// nodes are skipped. Unknown/empty entry ids fall back to the start block.
		const startId = firstStart(state);
		const entryNodeId =
			options.entryNodeId != null && options.entryNodeId in state.blocks
				? options.entryNodeId
				: startId;
		const reachable =
			entryNodeId != null
				? reachableFrom(planState, entryNodeId, () => true)
				: new Set(validation.executionPlan);
		const executionPlan = validation.executionPlan.filter((id) =>
			reachable.has(id),
		);

		const incoming = new Map<string, RoxEdge[]>();
		for (const edge of planState.edges) {
			const list = incoming.get(edge.target) ?? [];
			list.push(edge);
			incoming.set(edge.target, list);
		}

		const active = new Map<string, boolean>();
		const chosenHandle = new Map<string, string | undefined>();
		const outputs = new Map<string, Record<string, unknown>>();
		let runOutput: Record<string, unknown> | undefined;

		const edgeFires = (edge: RoxEdge): boolean => {
			if (!active.get(edge.source)) return false;
			if (edge.sourceHandle == null) return true;
			return chosenHandle.get(edge.source) === edge.sourceHandle;
		};

		/** Attach the accumulating context to a result only when pipelines used it. */
		const withContext = (result: RunResult): RunResult =>
			contextTouched ? { ...result, accumulatedContext: runContext } : result;

		/**
		 * Execute a single block, mutating the shared run state (`active`,
		 * `chosenHandle`, `outputs`, `runContext`, `runOutput`). Returns a terminal
		 * {@link RunResult} when the run must stop here (pause/fail/cancel), the
		 * sentinel `"skipped"` when the block did not fire, or `undefined` to
		 * continue. `seedNode` is the run's entry node (start or node-entry target):
		 * it is always active even with no live in-edges. `forceInput`, when given,
		 * seeds the block directly (used to re-enter a loop body's entry node with
		 * the back-edge's payload). `iteration` is the loop replay index (0 on the
		 * main pass, ≥1 on bounded loop re-entries) — stamped onto the
		 * `onAgentRunFinished` emit so the cross-run dispatcher dedupes replays.
		 */
		const runBlock = async (
			blockId: string,
			seedNode: string | undefined,
			forceInput?: Record<string, unknown>,
			iteration = 0,
		): Promise<RunResult | "skipped" | undefined> => {
			if (options.isCanceled?.()) {
				return withContext({ status: "canceled", steps, output: runOutput });
			}
			const block = state.blocks[blockId];
			if (!block) return undefined;

			const liveEdges = (incoming.get(blockId) ?? []).filter(edgeFires);
			const isActive =
				blockId === seedNode || liveEdges.length > 0 || forceInput != null;
			if (!isActive) {
				active.set(blockId, false);
				await record({ blockId, blockType: block.type, status: "skipped" });
				return "skipped";
			}
			active.set(blockId, true);

			// A node-entry seed node (started AT by a trigger, not the `start` block)
			// has no upstream outputs, so it receives the run input directly — that's
			// the trigger-injected payload. The `start` block keeps an empty input
			// (its builtin handler reads `runInput` itself), preserving legacy behavior.
			const isNodeEntrySeed =
				blockId === seedNode &&
				block.type !== "start" &&
				liveEdges.length === 0;
			const input =
				forceInput ??
				(isNodeEntrySeed
					? runInput
					: mergeInputs(liveEdges.map((e) => outputs.get(e.source) ?? {})));

			// Human approval: resolved decisions gate the branch; unresolved pause.
			if (block.type === "human_approval") {
				const decision = options.approvals?.[blockId];
				if (decision === "approved") {
					outputs.set(blockId, input);
					chosenHandle.set(blockId, "approved");
					await record({
						blockId,
						blockType: block.type,
						blockName: block.name,
						status: "succeeded",
						input,
						output: input,
					});
					return undefined;
				}
				if (decision === "rejected") {
					// Prune the gated branch: the block's edges no longer fire.
					active.set(blockId, false);
					chosenHandle.set(blockId, "rejected");
					await record({
						blockId,
						blockType: block.type,
						blockName: block.name,
						status: "canceled",
						input,
					});
					return undefined;
				}
				await record({
					blockId,
					blockType: block.type,
					blockName: block.name,
					status: "waiting_approval",
					input,
				});
				return withContext({
					status: "waiting_approval",
					steps,
					output: runOutput,
					pendingApproval: {
						blockId,
						title: block.name,
						payload: input,
					},
				});
			}

			// Skill call spawns a child run via the resolver.
			if (isSkillCallType(block.type)) {
				const slug = skillSlugFromType(block.type) ?? "";
				if (!options.resolveSkillCall) {
					await record({
						blockId,
						blockType: block.type,
						status: "failed",
						input,
						error: {
							code: "NO_SKILL_RESOLVER",
							message: `No resolver for ${slug}`,
						},
					});
					return {
						status: "failed",
						steps,
						error: {
							code: "NO_SKILL_RESOLVER",
							message: `No resolver for ${slug}`,
						},
					};
				}
				const result = await options.resolveSkillCall(slug, input);
				if (result.error) {
					const errorMode = String(block.subBlocks?.errorMode ?? "fail_parent");
					await record({
						blockId,
						blockType: block.type,
						status: "failed",
						input,
						error: result.error,
						childRunId: result.childRunId,
					});
					if (errorMode === "continue") {
						outputs.set(blockId, { error: result.error });
						return undefined;
					}
					return { status: "failed", steps, error: result.error };
				}
				const output = result.output ?? {};
				outputs.set(blockId, output);
				await record({
					blockId,
					blockType: block.type,
					status: "succeeded",
					input,
					output,
					childRunId: result.childRunId,
				});
				return undefined;
			}

			// Agent run: dispatches a chat/CLI agent via the injected resolver,
			// threading the accumulating context (message + prior outputs) and
			// appending this node's output for downstream nodes (design §3.2).
			if (block.type === "agent_run") {
				contextTouched = true;
				if (!options.resolveAgentRun) {
					const error = {
						code: "NO_AGENT_RESOLVER",
						message: `No resolver for agent_run block "${blockId}"`,
					};
					await record({
						blockId,
						blockType: block.type,
						blockName: block.name,
						status: "failed",
						input,
						error,
					});
					return withContext({ status: "failed", steps, error });
				}
				const req: AgentRunRequest = {
					blockId,
					roleSkillSlug: String(block.subBlocks?.roleSkillSlug ?? ""),
					promptTemplate:
						typeof block.subBlocks?.promptTemplate === "string"
							? block.subBlocks.promptTemplate
							: undefined,
					input,
					context: runContext,
				};
				const res = await options.resolveAgentRun(req);
				if (res.error) {
					const errorMode = String(block.subBlocks?.errorMode ?? "fail_parent");
					await record({
						blockId,
						blockType: block.type,
						blockName: block.name,
						status: "failed",
						input,
						error: res.error,
						childRunId: res.childRunRef?.sessionId,
					});
					if (errorMode === "continue") {
						chosenHandle.set(blockId, "error");
						outputs.set(blockId, { error: res.error });
						return undefined;
					}
					return withContext({ status: "failed", steps, error: res.error });
				}
				// Accumulate: later nodes see this node's output in the transcript.
				for (const entry of res.appendedContext ?? []) {
					runContext = appendContextEntry(runContext, entry);
				}
				const output = res.output ?? {};
				outputs.set(blockId, output);
				chosenHandle.set(blockId, "out");
				await record({
					blockId,
					blockType: block.type,
					blockName: block.name,
					status: "succeeded",
					input,
					output,
					childRunId: res.childRunRef?.sessionId,
				});
				// In-run emit seam (design §4.3): notify the run-service so it can
				// fire the `agent_run_finished` (+ per-artifact) pipeline events.
				// Fire-and-forget — a throwing hook must never break the run loop.
				if (options.onAgentRunFinished) {
					try {
						options.onAgentRunFinished({
							blockId,
							roleSkillSlug: req.roleSkillSlug,
							output,
							childRunRef: res.childRunRef,
							iteration,
						});
					} catch {
						// Hook owns its own error reporting.
					}
				}
				return undefined;
			}

			// Regular handler.
			const handler =
				handlers[block.type] ?? ((ctx) => ({ output: ctx.input }));
			const handlerCtx: BlockHandlerContext = {
				blockId,
				block,
				input,
				runInput,
				resolveSecret,
			};
			let result: Awaited<ReturnType<BlockHandler>>;
			try {
				result = await handler(handlerCtx);
			} catch (err) {
				const error = {
					code: "BLOCK_HANDLER_THREW",
					message: err instanceof Error ? err.message : String(err),
					blockId,
				};
				await record({
					blockId,
					blockType: block.type,
					status: "failed",
					input,
					error,
				});
				return { status: "failed", steps, error };
			}
			if (result.error) {
				await record({
					blockId,
					blockType: block.type,
					status: "failed",
					input,
					error: result.error,
				});
				return { status: "failed", steps, error: result.error };
			}

			const output = result.output ?? {};
			outputs.set(blockId, output);
			chosenHandle.set(blockId, result.handle);
			await record({
				blockId,
				blockType: block.type,
				blockName: block.name,
				status: "succeeded",
				input,
				output,
			});
			if (block.type === "response") runOutput = output;
			return undefined;
		};

		// Main pass: walk the acyclic (back-edge-stripped) plan from the seed node.
		for (const blockId of executionPlan) {
			const signal = await runBlock(blockId, entryNodeId);
			if (signal != null && signal !== "skipped") return signal;
		}

		// Bounded re-entrant loop walk. After the main pass, a loop's back-edge
		// "fires" when its loop-controller node selected the back-edge's source
		// handle (e.g. a critic chose "revise" → improver). While that holds AND we
		// are under the loop's iteration cap, replay the loop body (entry first,
		// re-seeded with the back-edge payload, then the remaining body nodes in
		// plan order). The cap from `resolveLoopIterationCap` guarantees the walk
		// terminates, so a feedback loop can never append context forever.
		for (const loop of loops) {
			const loopResult = await this.walkLoop({
				loop,
				state,
				cap: resolveLoopIterationCap(state.loops[loop.loopId]?.maxIterations),
				executionPlan,
				edgeFires,
				outputs,
				runBlock,
			});
			if (loopResult != null) return loopResult;
		}

		// Output schema validation.
		if (options.outputSchema) {
			const issues = validateOutput(runOutput ?? {}, options.outputSchema);
			if (issues.length > 0) {
				return withContext({
					status: "failed",
					steps,
					output: runOutput,
					error: {
						code: "OUTPUT_SCHEMA_VALIDATION_FAILED",
						message: "Run output did not match the output schema",
						details: { issues },
					},
				});
			}
		}

		return withContext({ status: "succeeded", steps, output: runOutput });
	}

	/**
	 * Walk one feedback loop a bounded number of times. Each re-entry replays the
	 * loop entry node (force-seeded with the back-edge's payload) followed by every
	 * downstream plan node, so outputs re-flow to the terminal `response`. The walk
	 * stops when the loop's back-edge no longer fires (the controller chose the exit
	 * handle) or the iteration `cap` is reached, whichever comes first — so context
	 * accumulation is bounded. Returns a terminal {@link RunResult} if a replayed
	 * block stops the run (pause/fail/cancel), else `undefined`.
	 */
	private async walkLoop(args: {
		loop: ResolvedLoop;
		state: RoxWorkflowState;
		cap: number;
		executionPlan: string[];
		edgeFires: (edge: RoxEdge) => boolean;
		outputs: Map<string, Record<string, unknown>>;
		runBlock: (
			blockId: string,
			seedNode: string | undefined,
			forceInput?: Record<string, unknown>,
			iteration?: number,
		) => Promise<RunResult | "skipped" | undefined>;
	}): Promise<RunResult | undefined> {
		const { loop, executionPlan, edgeFires, outputs, runBlock, cap } = args;
		// Plan nodes at/after the loop entry: replayed on each re-entry so the loop
		// body AND its downstream consumers see the new iteration's output.
		const entryIdx = executionPlan.indexOf(loop.entryNodeId);
		if (entryIdx < 0) return undefined;
		const replaySlice = executionPlan.slice(entryIdx);

		// `iteration` counts re-entries beyond the initial main-pass execution; the
		// initial pass is iteration 0, so we may re-enter up to `cap - 1` times.
		for (let iteration = 1; iteration < cap; iteration++) {
			const firing = loop.backEdges.find(edgeFires);
			if (firing == null) break; // controller chose the exit: loop settles.
			// Re-seed the entry node with the back-edge source's latest output so the
			// loop body sees the controller's feedback (e.g. the critic's revision).
			const feedback = outputs.get(firing.source) ?? {};
			for (const blockId of replaySlice) {
				const forceInput = blockId === loop.entryNodeId ? feedback : undefined;
				// Stamp the replay index so a finished agent_run node re-fired on this
				// loop iteration carries iteration ≥ 1; the cross-run dispatcher dedupes
				// replays and fans out at most once per settled node.
				const signal = await runBlock(
					blockId,
					undefined,
					forceInput,
					iteration,
				);
				if (signal != null && signal !== "skipped") return signal;
			}
		}
		return undefined;
	}
}

function firstStart(state: RoxWorkflowState): string | undefined {
	for (const [id, block] of Object.entries(state.blocks)) {
		if (block.type === "start") return id;
	}
	return undefined;
}
