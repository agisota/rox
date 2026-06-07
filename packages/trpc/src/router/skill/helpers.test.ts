import { describe, expect, test } from "bun:test";
import type { JsonSchema, RoxWorkflowState } from "@rox/workflow-core";
import {
	assertExactlyOneImplementationRef,
	assertExposedVia,
	assertRunModeAllowed,
	bindingMatchesSurface,
	countImplementationRefs,
	isRunModeAllowed,
	isSkillExposedVia,
	validatePublishInput,
} from "./helpers";

const validState: RoxWorkflowState = {
	blocks: { start: { type: "start" }, response: { type: "response" } },
	edges: [{ source: "start", target: "response" }],
	variables: {},
	loops: {},
	parallels: {},
	metadata: { name: "demo" },
};
const inputSchema: JsonSchema = { type: "object", properties: {} };
const outputSchema: JsonSchema = { type: "object", properties: {} };

describe("implementation refs (DB-06)", () => {
	test("exactly one passes", () => {
		expect(countImplementationRefs({ workflowDeploymentId: "x" })).toBe(1);
		expect(() =>
			assertExactlyOneImplementationRef({ legacyAutomationId: "a" }),
		).not.toThrow();
	});
	test("zero or many throws", () => {
		expect(() => assertExactlyOneImplementationRef({})).toThrow();
		expect(() =>
			assertExactlyOneImplementationRef({
				workflowDeploymentId: "x",
				legacyAutomationId: "a",
			}),
		).toThrow();
	});
});

describe("validatePublishInput (SKILL-02/03)", () => {
	test("valid graph + both schemas => ok", () => {
		expect(validatePublishInput(validState, inputSchema, outputSchema).ok).toBe(
			true,
		);
	});
	test("invalid graph => not ok", () => {
		const cyclic: RoxWorkflowState = {
			...validState,
			blocks: { start: { type: "start" }, b: { type: "condition" } },
			edges: [
				{ source: "start", target: "b" },
				{ source: "b", target: "start" },
			],
		};
		const r = validatePublishInput(cyclic, inputSchema, outputSchema);
		expect(r.ok).toBe(false);
		expect(r.issues.length).toBeGreaterThan(0);
	});
	test("missing output schema => not ok", () => {
		expect(validatePublishInput(validState, inputSchema, undefined).ok).toBe(
			false,
		);
	});
});

describe("run-mode enforcement (SKILL-07)", () => {
	test("allowed mode passes, disallowed throws", () => {
		expect(isRunModeAllowed(["manual"], "manual")).toBe(true);
		expect(isRunModeAllowed(["manual"], "mcp")).toBe(false);
		expect(() => assertRunModeAllowed(["manual"], "manual")).not.toThrow();
		expect(() => assertRunModeAllowed(["manual"], "mcp")).toThrow();
	});
});

describe("binding surface filter (SKILL-05/06)", () => {
	const repoAction = {
		surface: "object_action",
		objectType: "repo",
		enabled: true,
	};
	test("matches same surface + object type", () => {
		expect(bindingMatchesSurface(repoAction, "object_action", "repo")).toBe(
			true,
		);
	});
	test("does not match a different object type", () => {
		expect(bindingMatchesSurface(repoAction, "object_action", "task")).toBe(
			false,
		);
	});
	test("disabled binding never matches", () => {
		expect(
			bindingMatchesSurface(
				{ ...repoAction, enabled: false },
				"object_action",
				"repo",
			),
		).toBe(false);
	});
	test("mcp surface gating", () => {
		const mcp = { surface: "mcp", objectType: null, enabled: true };
		expect(bindingMatchesSurface(mcp, "mcp")).toBe(true);
		expect(bindingMatchesSurface(mcp, "object_action")).toBe(false);
	});
});

describe("isSkillExposedVia / assertExposedVia (MCP-02 / API-02 / E2E-04)", () => {
	const bindings = [
		{ surface: "object_action", objectType: "repo", enabled: true },
		{ surface: "mcp", objectType: null, enabled: false },
	];
	test("exposed when an enabled binding exists", () => {
		expect(isSkillExposedVia(bindings, "object_action", "repo")).toBe(true);
		expect(() =>
			assertExposedVia(bindings, "object_action", "repo"),
		).not.toThrow();
	});
	test("not exposed when binding is disabled (MCP-02)", () => {
		expect(isSkillExposedVia(bindings, "mcp")).toBe(false);
		expect(() => assertExposedVia(bindings, "mcp")).toThrow();
	});
	test("not exposed when no binding exists (API-02 / agent_tool)", () => {
		expect(isSkillExposedVia(bindings, "api")).toBe(false);
		expect(isSkillExposedVia(bindings, "agent_tool")).toBe(false);
		expect(() => assertExposedVia(bindings, "api")).toThrow();
	});
	test("object action only on the bound object type (E2E-04)", () => {
		expect(isSkillExposedVia(bindings, "object_action", "task")).toBe(false);
	});
});
