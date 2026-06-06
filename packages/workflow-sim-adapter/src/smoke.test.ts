import { describe, expect, test } from "bun:test";
import { type SimIntegrationMode, WORKFLOW_SIM_ADAPTER_VERSION } from "./index";

describe("workflow-sim-adapter smoke", () => {
	test("package exposes a version", () => {
		expect(WORKFLOW_SIM_ADAPTER_VERSION).toBe("0.1.0");
	});

	test("integration modes are well-typed", () => {
		const modes: SimIntegrationMode[] = [
			"import_only",
			"sidecar",
			"native_converted",
		];
		expect(modes).toHaveLength(3);
	});
});
