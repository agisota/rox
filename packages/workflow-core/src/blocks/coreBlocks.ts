import { type BlockDefinition, defineBlock } from "./blockDefinition";

/**
 * Built-in block definitions understood by the runtime. Skill calls are dynamic
 * (`skill_call:<slug>`) and not listed here.
 */
export const CORE_BLOCKS: BlockDefinition[] = [
	defineBlock("start", {
		label: "Start",
		description: "Workflow entry point.",
		inputs: [],
		outputs: [{ name: "out" }],
		risk: "none",
	}),
	defineBlock("response", {
		label: "Response",
		description: "Terminal block that returns the workflow output.",
		inputs: [{ name: "in" }],
		outputs: [],
		risk: "none",
	}),
	defineBlock("condition", {
		label: "Condition",
		description: "Branches on a boolean expression.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "true" }, { name: "false" }],
		risk: "none",
	}),
	defineBlock("switch", {
		label: "Switch",
		description: "Branches on a matched case.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "default" }],
		risk: "none",
	}),
	defineBlock("loop", {
		label: "Loop",
		description: "Iterates a sub-graph.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "low",
	}),
	defineBlock("parallel", {
		label: "Parallel",
		description: "Runs branches concurrently and joins their outputs.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "low",
	}),
	defineBlock("wait", {
		label: "Wait",
		description: "Waits for an external event.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "low",
	}),
	defineBlock("delay", {
		label: "Delay",
		description: "Waits a fixed duration.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "none",
	}),
	defineBlock("human_approval", {
		label: "Human Approval",
		description: "Pauses the run until a human approves or rejects.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "approved" }, { name: "rejected" }],
		risk: "medium",
		pausesRun: true,
	}),
	defineBlock("skill_call", {
		label: "Skill Call",
		description: "Invokes a published skill as a child run.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "medium",
	}),
	defineBlock("error_boundary", {
		label: "Error Boundary",
		description: "Catches errors from a wrapped sub-graph.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "ok" }, { name: "error" }],
		risk: "none",
	}),
];
