import { describe, expect, it } from "bun:test";
import {
	AGENT_DEFAULT_MODEL_ID,
	AGENT_ROLE_LABELS,
	AGENT_ROLES,
	CUSTOM_AGENT_OPTION_ID,
	DEFAULT_ROLE_AGENT_ID,
	DEFAULT_ROLE_MODEL_ID,
	defaultModelForAgent,
	defaultRoleModelMapping,
	isKnownAgentId,
	modelOptionsForAgent,
	parseRoleModelMapping,
	ROLE_AGENT_OPTIONS,
	type RoleModelMapping,
	resolveRoleForStep,
	resolveSelectionForRole,
	selectModelForStep,
	serializeRoleModelMapping,
} from "./agent-roles";
import { ROX_R1_MODEL_ID } from "./rox-models";

describe("agent roles catalog", () => {
	it("has exactly the five orchestration roles", () => {
		expect(AGENT_ROLES).toEqual([
			"orchestrator",
			"planning",
			"execution",
			"research",
			"review",
		]);
	});

	it("labels every role", () => {
		for (const role of AGENT_ROLES) {
			expect(AGENT_ROLE_LABELS[role]).toBeTruthy();
		}
	});

	it("defaults agent+model to ROX/ROX", () => {
		expect(DEFAULT_ROLE_AGENT_ID).toBe("rox");
		expect(DEFAULT_ROLE_MODEL_ID).toBe(ROX_R1_MODEL_ID);
	});

	it("offers ROX first and custom last in the agent options", () => {
		expect(ROLE_AGENT_OPTIONS[0]?.id).toBe(DEFAULT_ROLE_AGENT_ID);
		expect(ROLE_AGENT_OPTIONS.at(-1)?.id).toBe(CUSTOM_AGENT_OPTION_ID);
		expect(ROLE_AGENT_OPTIONS.map((o) => o.id)).toContain("groq");
	});

	it("recognizes builtin agent ids and rejects custom", () => {
		expect(isKnownAgentId("rox")).toBe(true);
		expect(isKnownAgentId("claude")).toBe(true);
		expect(isKnownAgentId(CUSTOM_AGENT_OPTION_ID)).toBe(false);
	});
});

describe("defaultRoleModelMapping", () => {
	it("maps every role to ROX/ROX", () => {
		const mapping = defaultRoleModelMapping();
		for (const role of AGENT_ROLES) {
			expect(mapping[role]).toEqual({
				agentId: "rox",
				modelId: ROX_R1_MODEL_ID,
			});
		}
	});

	it("returns independent objects per call (no shared mutation)", () => {
		const a = defaultRoleModelMapping();
		a.planning.modelId = "mutated";
		const b = defaultRoleModelMapping();
		expect(b.planning.modelId).toBe(ROX_R1_MODEL_ID);
	});
});

describe("parseRoleModelMapping", () => {
	it("returns all-ROX defaults for null/empty/garbage", () => {
		const expected = defaultRoleModelMapping();
		expect(parseRoleModelMapping(null)).toEqual(expected);
		expect(parseRoleModelMapping(undefined)).toEqual(expected);
		expect(parseRoleModelMapping("")).toEqual(expected);
		expect(parseRoleModelMapping("{not json")).toEqual(expected);
		expect(parseRoleModelMapping(42)).toEqual(expected);
	});

	it("merges a partial mapping onto defaults", () => {
		const mapping = parseRoleModelMapping(
			JSON.stringify({
				planning: { agentId: "claude", modelId: "claude-sonnet" },
			}),
		);
		expect(mapping.planning).toEqual({
			agentId: "claude",
			modelId: "claude-sonnet",
		});
		// Untouched roles stay on the ROX default.
		expect(mapping.execution).toEqual({
			agentId: "rox",
			modelId: ROX_R1_MODEL_ID,
		});
	});

	it("accepts an already-parsed object", () => {
		const mapping = parseRoleModelMapping({
			review: { agentId: "codex", modelId: "gpt-5" },
		});
		expect(mapping.review.agentId).toBe("codex");
	});

	it("drops a role with an invalid selection (falls back to default)", () => {
		const mapping = parseRoleModelMapping({
			research: { agentId: "", modelId: "x" },
		});
		expect(mapping.research).toEqual({
			agentId: "rox",
			modelId: ROX_R1_MODEL_ID,
		});
	});

	it("round-trips through serialize", () => {
		const original: RoleModelMapping = defaultRoleModelMapping();
		original.execution = { agentId: "opencode", modelId: "some-model" };
		const restored = parseRoleModelMapping(serializeRoleModelMapping(original));
		expect(restored).toEqual(original);
	});
});

describe("resolveRoleForStep", () => {
	it("matches exact role names case-insensitively", () => {
		expect(resolveRoleForStep("planning")).toBe("planning");
		expect(resolveRoleForStep("Execution")).toBe("execution");
		expect(resolveRoleForStep("  REVIEW ")).toBe("review");
	});

	it("classifies free-text step phrases by keyword", () => {
		expect(resolveRoleForStep("plan the migration")).toBe("planning");
		expect(resolveRoleForStep("implement the parser")).toBe("execution");
		expect(resolveRoleForStep("research the codebase")).toBe("research");
		expect(resolveRoleForStep("review the diff")).toBe("review");
		expect(resolveRoleForStep("dispatch subtasks")).toBe("orchestrator");
	});

	it("defaults unrecognized steps to the orchestrator", () => {
		expect(resolveRoleForStep("zzz")).toBe("orchestrator");
		expect(resolveRoleForStep("")).toBe("orchestrator");
	});
});

describe("resolveSelectionForRole / selectModelForStep", () => {
	it("falls back to ROX/ROX for an unconfigured role or null mapping", () => {
		expect(resolveSelectionForRole("planning", null)).toEqual({
			agentId: "rox",
			modelId: ROX_R1_MODEL_ID,
		});
	});

	it("routes each step to its configured role's model", () => {
		const mapping: RoleModelMapping = defaultRoleModelMapping();
		mapping.planning = { agentId: "claude", modelId: "claude-plan" };
		mapping.execution = { agentId: "codex", modelId: "codex-exec" };
		mapping.review = { agentId: "opencode", modelId: "oc-review" };

		expect(selectModelForStep("plan the work", mapping)).toEqual({
			agentId: "claude",
			modelId: "claude-plan",
		});
		expect(selectModelForStep("implement it", mapping)).toEqual({
			agentId: "codex",
			modelId: "codex-exec",
		});
		expect(selectModelForStep("review it", mapping)).toEqual({
			agentId: "opencode",
			modelId: "oc-review",
		});
		// Research was never configured → ROX/ROX default.
		expect(selectModelForStep("research it", mapping)).toEqual({
			agentId: "rox",
			modelId: ROX_R1_MODEL_ID,
		});
	});
});

describe("modelOptionsForAgent / defaultModelForAgent", () => {
	it("offers the ROX house model for the ROX agent (preselected default)", () => {
		const options = modelOptionsForAgent(DEFAULT_ROLE_AGENT_ID);
		expect(options[0]?.value).toBe(ROX_R1_MODEL_ID);
		expect(defaultModelForAgent(DEFAULT_ROLE_AGENT_ID)).toBe(ROX_R1_MODEL_ID);
	});

	it("offers an agent-default option for non-ROX agents", () => {
		expect(modelOptionsForAgent("claude")[0]?.value).toBe(
			AGENT_DEFAULT_MODEL_ID,
		);
		expect(defaultModelForAgent("codex")).toBe(AGENT_DEFAULT_MODEL_ID);
	});

	it("always returns at least one option", () => {
		expect(modelOptionsForAgent("anything").length).toBeGreaterThan(0);
	});
});
