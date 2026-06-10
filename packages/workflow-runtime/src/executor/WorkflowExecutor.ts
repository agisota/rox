import {
	isSkillCallType,
	type SupersetEdge,
	type SupersetWorkflowState,
	skillSlugFromType,
	validateGraph,
	validateOutput,
} from "@rox/workflow-core";
import { Redactor } from "../context/Redactor";
import type {
	BlockHandler,
	BlockHandlerContext,
	ExecuteOptions,
	RunResult,
	StepRecord,
} from "./types";

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
		state: SupersetWorkflowState,
		runInput: Record<string, unknown>,
		options: ExecuteOptions = {},
	): Promise<RunResult> {
		const steps: StepRecord[] = [];
		const redactor = new Redactor(options.secrets);
		const handlers = { ...builtinHandlers(), ...(options.handlers ?? {}) };
		const resolveSecret = (key: string) => options.secrets?.[key];

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

		const incoming = new Map<string, SupersetEdge[]>();
		for (const edge of state.edges) {
			const list = incoming.get(edge.target) ?? [];
			list.push(edge);
			incoming.set(edge.target, list);
		}

		const active = new Map<string, boolean>();
		const chosenHandle = new Map<string, string | undefined>();
		const outputs = new Map<string, Record<string, unknown>>();
		let runOutput: Record<string, unknown> | undefined;

		const edgeFires = (edge: SupersetEdge): boolean => {
			if (!active.get(edge.source)) return false;
			if (edge.sourceHandle == null) return true;
			return chosenHandle.get(edge.source) === edge.sourceHandle;
		};

		for (const blockId of validation.executionPlan) {
			if (options.isCanceled?.()) {
				return { status: "canceled", steps, output: runOutput };
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
				return {
					status: "waiting_approval",
					steps,
					output: runOutput,
					pendingApproval: {
						blockId,
						title: block.name,
						payload: input,
					},
				};
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
				return {
					status: "failed",
					steps,
					output: runOutput,
					error: {
						code: "OUTPUT_SCHEMA_VALIDATION_FAILED",
						message: "Run output did not match the output schema",
						details: { issues },
					},
				};
			}
		}

		return { status: "succeeded", steps, output: runOutput };
	}
}

function firstStart(state: SupersetWorkflowState): string | undefined {
	for (const [id, block] of Object.entries(state.blocks)) {
		if (block.type === "start") return id;
	}
	return undefined;
}
