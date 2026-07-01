import { describe, expect, test } from "bun:test";
import { FUSION_ADAPTER_VERSION, fusionErd } from "./index";

describe("fusion-adapter smoke", () => {
	test("package exposes version and ERD entries", () => {
		expect(FUSION_ADAPTER_VERSION).toBe("0.1.0");
		expect(fusionErd.some((entry) => entry.table === "tasks")).toBe(true);
		expect(fusionErd.some((entry) => entry.table === "nodes")).toBe(true);
	});
});
