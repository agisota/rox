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
	defineBlock("merge", {
		label: "Merge",
		description: "Joins multiple branches into one object.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }],
		risk: "none",
	}),
	defineBlock("gate", {
		label: "Gate",
		description: "Routes the input to one of N outputs by predicate.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "default" }],
		risk: "none",
	}),
	defineBlock("route", {
		label: "Route",
		description: "Routes the input to one of N outputs by predicate.",
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
	defineBlock("agent_run", {
		label: "Agent Run",
		description:
			"Runs an agent role (chat in-process or CLI in a worktree) as a pipeline node.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "high",
	}),
	defineBlock("model", {
		label: "Model",
		description:
			"Single LLM call (system + user prompt) without an agent role; returns generated text + usage.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("http_request", {
		label: "HTTP Request",
		description:
			"Calls an external HTTP(S) endpoint (method, url, headers, body) with SSRF protection; returns status, headers, and body.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "medium",
	}),
	defineBlock("transform", {
		label: "Transform",
		description:
			"Reshapes the payload: render a template string or map output fields from safe expressions over the input.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "none",
	}),
	defineBlock("parser", {
		label: "Parser",
		description:
			"Parses an input string (JSON / CSV / regex-extract) into structured data; parse failures route to error.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "none",
	}),
	defineBlock("variable_set", {
		label: "Variable Set",
		description:
			"Writes a named value (literal or expression) onto the flowing context for downstream nodes.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "none",
	}),
	defineBlock("error_boundary", {
		label: "Error Boundary",
		description: "Catches errors from a wrapped sub-graph.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "ok" }, { name: "error" }],
		risk: "none",
	}),
];
