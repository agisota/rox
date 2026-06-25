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
	defineBlock("knowledge_retrieval", {
		label: "Knowledge Retrieval",
		description:
			"RAG retrieval: fetches the most relevant chunks from a bound knowledge base for a query (top-K); returns the retrieved chunks + their source documents.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("db_query", {
		label: "DB Query",
		description:
			"Runs a parametrized read-only SELECT against the org-scoped database (DDL/DML rejected); returns the matched rows.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "medium",
	}),
	defineBlock("db_write", {
		label: "DB Write",
		description:
			"Runs a parametrized INSERT/UPDATE/DELETE against the org-scoped database in a transaction (rolled back on error); returns affected row count.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "high",
	}),
	defineBlock("tool_call", {
		label: "Tool Call",
		description:
			"Invokes a registered project tool by id with an arguments map; returns the tool result.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "medium",
	}),
	defineBlock("mcp_tool", {
		label: "MCP Tool",
		description:
			"Calls a tool exposed by a bound MCP server with an arguments map; returns the tool result.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "medium",
	}),
	defineBlock("web_search", {
		label: "Web Search",
		description:
			"Runs a query against the configured web-search provider and returns the top results.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("embedding", {
		label: "Embedding",
		description:
			"Embeds the input text into a fixed-dimension vector via the project's embedding provider; returns the vector + its dimensions.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("classifier", {
		label: "Classifier",
		description:
			"Zero-shot LLM classification of the input text into one of the configured labels; returns the chosen label + score and routes by class.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("structured_extract", {
		label: "Structured Extract",
		description:
			"LLM call with forced JSON output validated against the configured JSON schema; valid data goes to `out`, schema violations route to `error`.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "out" }, { name: "error" }],
		risk: "low",
	}),
	defineBlock("error_boundary", {
		label: "Error Boundary",
		description: "Catches errors from a wrapped sub-graph.",
		inputs: [{ name: "in" }],
		outputs: [{ name: "ok" }, { name: "error" }],
		risk: "none",
	}),
];
