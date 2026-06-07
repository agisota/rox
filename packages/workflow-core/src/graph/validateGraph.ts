import { isSkillCallType } from "../blocks/blockDefinition";
import { WorkflowErrorCode, type WorkflowIssue } from "../errors";
import { validateSkillInputMapping } from "../schema/validateSkillInputMapping";
import type {
	JsonSchema,
	RoxWorkflowState,
	WorkflowValidationResult,
} from "../types";
import { detectCycle } from "./detectCycles";
import { reachableFrom } from "./reachability";
import { topologicalSort } from "./topologicalSort";

export interface ValidateGraphOptions {
	/**
	 * Resolve a skill-call block type (`skill_call:<slug>`) to its input schema,
	 * so skill input mappings can be validated inline. Optional — when omitted,
	 * skill nodes are treated as opaque.
	 */
	resolveSkillInputSchema?: (blockType: string) => JsonSchema | undefined;
	/** Treat unknown block types as errors. Default: false (forward-compatible). */
	strictBlockTypes?: boolean;
	/** Predicate for known block types (used only when strictBlockTypes). */
	isKnownBlockType?: (type: string) => boolean;
}

function isEnabled(state: RoxWorkflowState, id: string): boolean {
	return state.blocks[id]?.enabled !== false;
}

/**
 * Validate a workflow graph without executing it. Accumulates every problem
 * (rather than throwing on the first) so the editor can surface them all, and
 * returns a deterministic `executionPlan` when the graph is valid.
 */
export function validateGraph(
	state: RoxWorkflowState,
	options: ValidateGraphOptions = {},
): WorkflowValidationResult {
	const issues: WorkflowIssue[] = [];
	const blocks = state.blocks;
	const ids = Object.keys(blocks);

	// 1. Exactly one start block.
	const startIds = ids.filter((id) => blocks[id]?.type === "start");
	if (startIds.length === 0) {
		issues.push({
			code: WorkflowErrorCode.MISSING_START_BLOCK,
			severity: "error",
			message: "Workflow must have exactly one start block; found none.",
		});
	} else if (startIds.length > 1) {
		issues.push({
			code: WorkflowErrorCode.MULTIPLE_START_BLOCKS,
			severity: "error",
			message: `Workflow must have exactly one start block; found ${startIds.length}.`,
		});
	}

	// 2. Every edge references existing nodes.
	state.edges.forEach((edge, i) => {
		const edgeId = edge.id ?? `#${i}`;
		if (!(edge.source in blocks)) {
			issues.push({
				code: WorkflowErrorCode.INVALID_EDGE_SOURCE,
				severity: "error",
				edgeId,
				message: `Edge source "${edge.source}" does not exist.`,
			});
		}
		if (!(edge.target in blocks)) {
			issues.push({
				code: WorkflowErrorCode.INVALID_EDGE_TARGET,
				severity: "error",
				edgeId,
				message: `Edge target "${edge.target}" does not exist.`,
			});
		}
	});

	// 3. No cycles.
	const cycle = detectCycle(state);
	if (cycle && cycle.length > 0) {
		issues.push({
			code: WorkflowErrorCode.CYCLE_DETECTED,
			severity: "error",
			blockId: cycle[0],
			message: `Cycle detected: ${cycle.join(" → ")}.`,
		});
	}

	// 4. Reachability (only meaningful with a single start).
	if (startIds.length === 1) {
		const start = startIds[0];
		if (start !== undefined) {
			const reachableEnabled = reachableFrom(state, start, (id) =>
				isEnabled(state, id),
			);
			const reachableAny = reachableFrom(state, start, () => true);
			for (const id of ids) {
				if (id === start || !isEnabled(state, id)) continue;
				if (reachableEnabled.has(id)) continue;
				if (reachableAny.has(id)) {
					issues.push({
						code: WorkflowErrorCode.DISABLED_BRIDGE_BLOCK,
						severity: "error",
						blockId: id,
						message: `Block "${id}" is only reachable through a disabled block.`,
					});
				} else {
					issues.push({
						code: WorkflowErrorCode.UNREACHABLE_BLOCK,
						severity: "error",
						blockId: id,
						message: `Block "${id}" is not reachable from the start block.`,
					});
				}
			}
		}
	}

	// 5. Per-block checks: unknown types + skill input mappings.
	for (const id of ids) {
		const block = blocks[id];
		if (!block) continue;
		if (
			options.strictBlockTypes &&
			options.isKnownBlockType &&
			!options.isKnownBlockType(block.type)
		) {
			issues.push({
				code: WorkflowErrorCode.UNKNOWN_BLOCK_TYPE,
				severity: "error",
				blockId: id,
				message: `Unknown block type "${block.type}".`,
			});
		}
		if (isSkillCallType(block.type) && options.resolveSkillInputSchema) {
			const inputSchema = options.resolveSkillInputSchema(block.type);
			if (inputSchema) {
				const rawMapping = block.subBlocks?.inputs ?? block.subBlocks ?? {};
				const mapping =
					typeof rawMapping === "object" && rawMapping !== null
						? (rawMapping as Record<string, unknown>)
						: {};
				issues.push(...validateSkillInputMapping(mapping, inputSchema, id));
			}
		}
	}

	const hasError = issues.some((issue) => issue.severity === "error");

	// 6. Deterministic execution plan over enabled + reachable nodes (only when valid).
	let executionPlan: string[] | undefined;
	if (!hasError && startIds.length === 1) {
		const start = startIds[0];
		if (start !== undefined) {
			const nodes = reachableFrom(state, start, (id) => isEnabled(state, id));
			executionPlan = topologicalSort(state, { nodes }) ?? undefined;
		}
	}

	return { valid: !hasError, issues, executionPlan };
}
