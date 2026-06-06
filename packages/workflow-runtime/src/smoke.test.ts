import { describe, expect, test } from "bun:test";
import { WORKFLOW_CORE_VERSION } from "@superset/workflow-core";
import { WORKFLOW_RUNTIME_VERSION } from "./index";

describe("workflow-runtime smoke", () => {
	test("package exposes a version", () => {
		expect(WORKFLOW_RUNTIME_VERSION).toBe("0.1.0");
	});

	test("can resolve workflow-core as a workspace dependency", () => {
		expect(WORKFLOW_CORE_VERSION).toBe("0.1.0");
	});
});
