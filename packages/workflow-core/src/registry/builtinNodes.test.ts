import { describe, expect, test } from "bun:test";
import { MAX_LOOP_ITERATIONS } from "../graph/loopWalk";
import {
	BUILTIN_NODE_TYPES,
	getNodeType,
	isRegisteredNodeType,
	listByCategory,
	listNodeTypes,
} from "./index";
import { NodeCategory } from "./nodeCategory";

describe("built-in node types", () => {
	test("the 5 existing types register into the shared registry", () => {
		for (const id of [
			"start",
			"agent_run",
			"loop",
			"human_approval",
			"response",
		]) {
			expect(isRegisteredNodeType(id)).toBe(true);
			expect(getNodeType(id)?.id).toBe(id);
		}
		expect(BUILTIN_NODE_TYPES).toHaveLength(5);
		expect(listNodeTypes().length).toBeGreaterThanOrEqual(5);
	});

	test("start is a singleton in the Input category with no config fields", () => {
		const start = getNodeType("start");
		expect(start?.category).toBe(NodeCategory.Input);
		expect(start?.singleton).toBe(true);
		expect(start?.fields).toEqual([]);
		expect(
			listByCategory(NodeCategory.Input).some((d) => d.id === "start"),
		).toBe(true);
	});

	test("agent_run configSchema accepts the keys AgentNodeForm writes", () => {
		const def = getNodeType("agent_run");
		expect(def).toBeDefined();
		if (!def) return;
		expect(
			def.configSchema.safeParse({
				roleSlug: "prompt-improver",
				modelOverride: "gpt-5",
				maxTurns: 4,
				temperature: 0.7,
			}).success,
		).toBe(true);
		// Empty config is valid (a role-less node persists; the required check is
		// opt-in at the graph level, not in the schema — keeps old graphs valid).
		expect(def.configSchema.safeParse({}).success).toBe(true);
		// Out-of-range temperature is rejected.
		expect(def.configSchema.safeParse({ temperature: 5 }).success).toBe(false);
		expect(def.configSchema.safeParse({ maxTurns: 0 }).success).toBe(false);
		// roleSlug field is flagged required for the auto-form.
		expect(def.fields.find((f) => f.key === "roleSlug")?.required).toBe(true);
	});

	test("loop configSchema validates maxIterations bounds (runtime cap)", () => {
		const def = getNodeType("loop");
		if (!def) throw new Error("loop not registered");
		expect(def.configSchema.safeParse({ maxIterations: 5 }).success).toBe(true);
		expect(def.configSchema.safeParse({}).success).toBe(true);
		expect(def.configSchema.safeParse({ maxIterations: 0 }).success).toBe(
			false,
		);
		expect(def.configSchema.safeParse({ maxIterations: 999 }).success).toBe(
			false,
		);
		// The upper bound mirrors the runtime loop-replay cap (#527): the cap value
		// is accepted, one over is rejected — no silently-clamped values.
		expect(
			def.configSchema.safeParse({ maxIterations: MAX_LOOP_ITERATIONS })
				.success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ maxIterations: MAX_LOOP_ITERATIONS + 1 })
				.success,
		).toBe(false);
	});

	test("human_approval pauses the run and stores approvalMessage", () => {
		const def = getNodeType("human_approval");
		if (!def) throw new Error("human_approval not registered");
		expect(def.pausesRun).toBe(true);
		expect(
			def.configSchema.safeParse({ approvalMessage: "Проверьте" }).success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ approvalMessage: "x".repeat(2001) }).success,
		).toBe(false);
	});

	test("response stores an optional outputNote and has no outputs", () => {
		const def = getNodeType("response");
		if (!def) throw new Error("response not registered");
		expect(def.outputs).toEqual([]);
		expect(def.configSchema.safeParse({ outputNote: "note" }).success).toBe(
			true,
		);
		expect(def.configSchema.safeParse({}).success).toBe(true);
	});

	test("every built-in field key is accepted by its configSchema", () => {
		// Guards the auto-form ↔ schema contract: a field the inspector renders
		// must round-trip through the schema (a sample value per field kind).
		for (const def of BUILTIN_NODE_TYPES) {
			for (const field of def.fields) {
				const sample =
					field.kind === "number"
						? (field.min ?? 1)
						: field.kind === "boolean"
							? true
							: field.kind === "key-value"
								? { k: "v" }
								: "sample";
				const result = def.configSchema.safeParse({ [field.key]: sample });
				expect(result.success).toBe(true);
			}
		}
	});
});
