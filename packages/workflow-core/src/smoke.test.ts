import { describe, expect, test } from "bun:test";
import {
	type SupersetWorkflowState,
	WORKFLOW_CORE_VERSION,
	WorkflowError,
	WorkflowErrorCode,
} from "./index";

describe("workflow-core smoke", () => {
	test("package exposes a version", () => {
		expect(WORKFLOW_CORE_VERSION).toBe("0.1.0");
	});

	test("error codes are stable strings", () => {
		expect(WorkflowErrorCode.MISSING_START_BLOCK).toBe("MISSING_START_BLOCK");
		const err = new WorkflowError(
			WorkflowErrorCode.CYCLE_DETECTED,
			"cycle found",
		);
		expect(err.code).toBe("CYCLE_DETECTED");
		expect(err).toBeInstanceOf(Error);
	});

	test("workflow state shape is constructible", () => {
		const state: SupersetWorkflowState = {
			blocks: { start: { type: "start" } },
			edges: [],
			variables: {},
			loops: {},
			parallels: {},
			metadata: { name: "smoke" },
		};
		expect(Object.keys(state.blocks)).toContain("start");
	});
});
