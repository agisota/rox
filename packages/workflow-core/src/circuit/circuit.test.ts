import { describe, expect, test } from "bun:test";
import { compileTransitionPrompt } from "./compileTransitionPrompt";
import { computeMonadCompleteness } from "./computeMonadCompleteness";
import { defaultCircuitForTask } from "./defaultCircuitForTask";
import { executionCircuitSpecSchema } from "./schema";
import type { ExecutionCircuitSpec } from "./types";
import {
	ExecutionCircuitErrorCode,
	validateExecutionCircuitSpec,
} from "./validateExecutionCircuitSpec";

const validSpec: ExecutionCircuitSpec = defaultCircuitForTask({
	title: "Ship the thing",
	description: "Do the work",
	priority: "high",
	status: "todo",
});

describe("defaultCircuitForTask", () => {
	test("EC-DEFAULT-01: produces a valid todo->working->done circuit", () => {
		expect(validSpec.initialState).toBe("todo");
		expect(validSpec.targetState).toBe("done");
		expect(validSpec.states.map((s) => s.id)).toEqual([
			"todo",
			"working",
			"done",
		]);
		expect(validateExecutionCircuitSpec(validSpec).valid).toBe(true);
		expect(executionCircuitSpecSchema.safeParse(validSpec).success).toBe(true);
	});

	test("EC-DEFAULT-02: is deterministic for the same input", () => {
		const a = defaultCircuitForTask({ title: "X", description: "Y" });
		const b = defaultCircuitForTask({ title: "X", description: "Y" });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	test("EC-DEFAULT-03: falls back to a placeholder title", () => {
		const spec = defaultCircuitForTask({ title: "   " });
		expect(spec.name).toContain("Untitled task");
	});
});

describe("validateExecutionCircuitSpec", () => {
	test("EC-VALIDATE-01: flags unknown transition state refs", () => {
		const bad: ExecutionCircuitSpec = {
			...validSpec,
			transitions: [
				{
					id: "broken",
					from: "todo",
					to: "ghost",
					monad: {},
				},
			],
		};
		const result = validateExecutionCircuitSpec(bad);
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain(
			ExecutionCircuitErrorCode.UNKNOWN_STATE_REF,
		);
	});

	test("EC-VALIDATE-02: flags a missing target state", () => {
		const bad: ExecutionCircuitSpec = { ...validSpec, targetState: "" };
		const result = validateExecutionCircuitSpec(bad);
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain(
			ExecutionCircuitErrorCode.MISSING_TARGET_STATE,
		);
	});

	test("EC-VALIDATE-03: flags duplicate state and transition ids", () => {
		const dup = {
			id: "start",
			from: "todo",
			to: "working",
			monad: {},
		};
		const bad: ExecutionCircuitSpec = {
			...validSpec,
			states: [...validSpec.states, { id: "todo" }],
			transitions: [dup, dup],
		};
		const codes = validateExecutionCircuitSpec(bad).issues.map((i) => i.code);
		expect(codes).toContain(ExecutionCircuitErrorCode.DUPLICATE_STATE_ID);
		expect(codes).toContain(ExecutionCircuitErrorCode.DUPLICATE_TRANSITION_ID);
	});

	test("EC-VALIDATE-04: empty output contract is a warning, not an error", () => {
		const bad: ExecutionCircuitSpec = {
			...validSpec,
			transitions: [
				{
					id: "t",
					from: "todo",
					to: "done",
					monad: { outputContract: { schema: {} } },
				},
			],
		};
		const result = validateExecutionCircuitSpec(bad);
		expect(result.valid).toBe(true);
		expect(result.issues.map((i) => i.code)).toContain(
			ExecutionCircuitErrorCode.EMPTY_OUTPUT_CONTRACT,
		);
	});
});

describe("computeMonadCompleteness", () => {
	test("EC-MONAD-01: empty monad scores 0", () => {
		const result = computeMonadCompleteness({});
		expect(result.score).toBe(0);
		expect(result.populated).toBe(0);
		expect(result.total).toBe(4);
	});

	test("EC-MONAD-02: fully-populated monad scores 1", () => {
		const result = computeMonadCompleteness({
			runtimeBinding: { kind: "agent" },
			outputContract: { schema: { type: "object" } },
			validators: [{ id: "v", kind: "schema" }],
			events: [{ id: "e" }],
		});
		expect(result.score).toBe(1);
		expect(result.breakdown).toEqual({
			runtimeBinding: true,
			outputContract: true,
			validators: true,
			events: true,
		});
	});

	test("EC-MONAD-03: empty validator/event arrays do not count", () => {
		const result = computeMonadCompleteness({
			runtimeBinding: { kind: "agent" },
			validators: [],
			events: [],
		});
		expect(result.populated).toBe(1);
		expect(result.score).toBe(0.25);
	});
});

describe("compileTransitionPrompt", () => {
	test("EC-COMPILE-01: is deterministic and stable", () => {
		const a = compileTransitionPrompt(validSpec, "complete");
		const b = compileTransitionPrompt(validSpec, "complete");
		expect(a.prompt).toBe(b.prompt);
		expect(a.transitionId).toBe("complete");
		expect(a.prompt).toContain("Circuit: Circuit: Ship the thing");
		expect(a.prompt).toContain("Transition: complete (working -> done)");
		expect(a.prompt).toContain("JSON object");
	});

	test("EC-COMPILE-02: sorts schema keys for byte-stable output", () => {
		const spec: ExecutionCircuitSpec = {
			...validSpec,
			transitions: [
				{
					id: "t",
					from: "todo",
					to: "done",
					monad: {
						outputContract: {
							schema: { properties: { b: {}, a: {} }, type: "object" },
						},
					},
				},
			],
		};
		const prompt = compileTransitionPrompt(spec, "t").prompt;
		expect(prompt).toContain('{"properties":{"a":{},"b":{}},"type":"object"}');
	});

	test("EC-COMPILE-03: throws for an unknown transition id", () => {
		expect(() => compileTransitionPrompt(validSpec, "nope")).toThrow();
	});
});
