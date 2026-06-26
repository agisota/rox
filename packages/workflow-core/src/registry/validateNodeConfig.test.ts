import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import { getNodeType } from "./index";
import { validateNodeConfig } from "./validateNodeConfig";

const agentRun = getNodeType("agent_run");
if (!agentRun) throw new Error("agent_run not registered");

describe("validateNodeConfig", () => {
	test("flags a missing required field (agent_run role)", () => {
		const issues = validateNodeConfig(agentRun, { type: "agent_run" }, "a1");
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.MISSING_REQUIRED_CONFIG,
		);
		expect(issues[0]?.blockId).toBe("a1");
		expect(issues[0]?.path).toBe("roleSlug");
	});

	test("treats a blank string as not provided", () => {
		const issues = validateNodeConfig(
			agentRun,
			{ type: "agent_run", subBlocks: { roleSlug: "   " } },
			"a1",
		);
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.MISSING_REQUIRED_CONFIG,
		);
	});

	test("passes when the required field is provided", () => {
		const issues = validateNodeConfig(
			agentRun,
			{ type: "agent_run", subBlocks: { roleSlug: "critic" } },
			"a1",
		);
		expect(issues).toEqual([]);
	});

	test("flags an out-of-range value via the zod schema", () => {
		const issues = validateNodeConfig(
			agentRun,
			{ type: "agent_run", subBlocks: { roleSlug: "critic", temperature: 9 } },
			"a1",
		);
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.INVALID_NODE_CONFIG,
		);
	});

	test("no issues for a type without required fields (loop, empty config)", () => {
		const loop = getNodeType("loop");
		if (!loop) throw new Error("loop not registered");
		expect(validateNodeConfig(loop, { type: "loop" }, "l1")).toEqual([]);
	});
});
