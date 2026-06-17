import {
	type AccumulatedContext,
	appendContextEntry,
	createAccumulatedContext,
	isSkillCallType,
	type RoxEdge,
	type RoxWorkflowState,
	skillSlugFromType,
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
 * (critic → improver). Honored by the `agent_run` accumulation so a feedback
 * loop cannot append context forever. The full re-entrant loop walk is scaffolded
 * (see TODO in `execute`); these bound it once it lands.
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

		// TODO(agent-pipelines): re-entrant loop execution. Today the executor walks
		// `validateGraph`'s single-pass topological plan once, and raw cycles are
		// rejected by `detectCycle`; feedback loops live in `state.loops` and are not
		// yet iterated here. When the loop walk lands, bound each loop body by
		// `resolveLoopIterationCap(state.loops[id]?.maxIterations)` and force the exit
		// edge once the cap is hit, appending each iteration to `runContext`.

		const record = async (step: StepRecord): Promise<void> => {
			const redacted: StepRecord = {
				...step,
				input: step.input ? redactor.redact(step.input) : undefined,
				output: step.output ? redactor.redact(step.output) : undefined,
			};
			steps.push(redacted);
			await options.recorder?.recordStep(redacted);
		};

		const validation = validateGraph(state);
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

		const incoming = new Map<string, RoxEdge[]>();
		for (const edge of state.edges) {
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

		for (const blockId of validation.executionPlan) {
			if (options.isCanceled?.()) {
				return withContext({ status: "canceled", steps, output: runOutput });
			}
			const block = state.blocks[blockId];
			if (!block) continue;

			const liveEdges = (incoming.get(blockId) ?? []).filter(edgeFires);
			const isActive = blockId === firstStart(state) || liveEdges.length > 0;
			if (!isActive) {
				active.set(blockId, false);
				await record({ blockId, blockType: block.type, status: "skipped" });
				continue;
			}
			active.set(blockId, true);

			const input = mergeInputs(
				liveEdges.map((e) => outputs.get(e.source) ?? {}),
			);

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
					continue;
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
					continue;
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
						continue;
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
				continue;
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
						continue;
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
						});
					} catch {
						// Hook owns its own error reporting.
					}
				}
				continue;
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
}

function firstStart(state: RoxWorkflowState): string | undefined {
	for (const [id, block] of Object.entries(state.blocks)) {
		if (block.type === "start") return id;
	}
	return undefined;
}
