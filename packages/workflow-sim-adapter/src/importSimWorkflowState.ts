import {
	type SupersetBlockState,
	type SupersetEdge,
	type SupersetVariable,
	type SupersetWorkflowState,
	skillCallBlockType,
} from "@rox/workflow-core";
import type { SimBlockState, SimWorkflowState } from "./simTypes";

/** Block type used for Sim blocks Superset can't yet execute (SIM-02). */
export const UNSUPPORTED_BLOCK_TYPE = "external_unsupported";

/** Maps Sim block types to Superset core block types. */
const SIM_TYPE_MAP: Record<string, string> = {
	starter: "start",
	start: "start",
	response: "response",
	condition: "condition",
	router: "switch",
	loop: "loop",
	parallel: "parallel",
};

export interface ImportSimResult {
	state: SupersetWorkflowState;
	/** Human-readable warnings (e.g. unsupported blocks needing mapping). */
	warnings: string[];
	/** Child-workflow ids referenced by Sim `workflow` blocks (skill_call deps). */
	childWorkflowDependencies: string[];
	/** True when nothing blocks publishing (no unsupported blocks). */
	publishable: boolean;
}

function childWorkflowRef(block: SimBlockState): string | undefined {
	const data = block.data ?? {};
	const ref =
		(data.workflowId as string | undefined) ??
		(data.workflow as string | undefined) ??
		(block.subBlocks?.workflowId as string | undefined);
	return typeof ref === "string" && ref.length > 0 ? ref : undefined;
}

function convertVariables(
	vars: SimWorkflowState["variables"],
): Record<string, SupersetVariable> {
	const out: Record<string, SupersetVariable> = {};
	for (const [k, v] of Object.entries(vars ?? {})) {
		const t = v.type;
		const type: SupersetVariable["type"] =
			t === "number" || t === "boolean" || t === "json" ? t : "string";
		out[k] = { type, value: v.value };
	}
	return out;
}

/**
 * Import a Sim `WorkflowState` JSON into a Superset workflow graph.
 *
 * - Known Sim block types map to Superset core blocks (SIM-01).
 * - Sim `workflow` (child-workflow) blocks map to `skill_call:<ref>` and the
 *   dependency is recorded (SIM-03).
 * - Unknown/unsupported Sim block types become an `external_unsupported`
 *   adapter block with a warning; the workflow can't publish until they're
 *   mapped or disabled (SIM-02).
 */
export function importSimWorkflowState(sim: SimWorkflowState): ImportSimResult {
	const warnings: string[] = [];
	const childWorkflowDependencies: string[] = [];
	const blocks: Record<string, SupersetBlockState> = {};

	for (const [id, simBlock] of Object.entries(sim.blocks)) {
		const base: SupersetBlockState = {
			type: "",
			name: simBlock.name,
			enabled: simBlock.enabled,
			position: simBlock.position,
			subBlocks: simBlock.subBlocks,
			metadata: { simType: simBlock.type },
		};

		if (simBlock.type === "workflow") {
			const ref = childWorkflowRef(simBlock);
			if (ref) {
				childWorkflowDependencies.push(ref);
				base.type = skillCallBlockType(ref);
			} else {
				base.type = UNSUPPORTED_BLOCK_TYPE;
				warnings.push(
					`Block "${id}" is a Sim workflow block without a resolvable child reference.`,
				);
			}
		} else {
			const mapped = SIM_TYPE_MAP[simBlock.type];
			if (mapped) {
				base.type = mapped;
			} else {
				base.type = UNSUPPORTED_BLOCK_TYPE;
				warnings.push(
					`Block "${id}" has unsupported Sim type "${simBlock.type}"; map it or disable it before publishing.`,
				);
			}
		}
		blocks[id] = base;
	}

	const edges: SupersetEdge[] = sim.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: e.sourceHandle ?? undefined,
		targetHandle: e.targetHandle ?? undefined,
	}));

	const loops: SupersetWorkflowState["loops"] = {};
	for (const [k, v] of Object.entries(sim.loops ?? {})) {
		loops[k] = { nodes: v.nodes, maxIterations: v.iterations };
	}
	const parallels: SupersetWorkflowState["parallels"] = {};
	for (const [k, v] of Object.entries(sim.parallels ?? {})) {
		parallels[k] = { nodes: v.nodes };
	}

	const state: SupersetWorkflowState = {
		blocks,
		edges,
		variables: convertVariables(sim.variables),
		loops,
		parallels,
		metadata: {
			name: sim.metadata?.name ?? "Imported Sim workflow",
			description: sim.metadata?.description,
		},
	};

	return {
		state,
		warnings,
		childWorkflowDependencies,
		publishable: warnings.length === 0,
	};
}
