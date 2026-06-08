import { describe, expect, it } from "bun:test";
import { computeMonadCompleteness } from "./monad-completeness";
import {
	compileTransitionPrompt,
	UnknownTransitionError,
} from "./prompt-compiler";
import type { ExecutionCircuitSpec, StateSpec, TransitionSpec } from "./types";
import { validateExecutionCircuitSpec } from "./validate";

const state = (id: string, name: string): StateSpec => ({
	id,
	name,
	description: `${name} description`,
	assertions: [`${name} assertion`],
});

function fullTransition(over: Partial<TransitionSpec> = {}): TransitionSpec {
	return {
		id: "t1",
		name: "Do the thing",
		description: "Execute the change",
		fromStateId: "current",
		toStateId: "target",
		requiredEvents: [
			{
				id: "e1",
				name: "inspect",
				description: "inspect context",
				required: true,
			},
		],
		runtime: { kind: "workspace", agent: "claude", worktreePath: "/wt/x" },
		monad: {
			contextRefs: ["task"],
			tools: ["bash"],
			permissions: [],
			constraints: ["scoped diff"],
			memoryRefs: [],
			qualityCriteria: ["tests pass"],
		},
		outputContract: { format: "json", requiredFields: ["status"] },
		validators: [
			{ kind: "manual", description: "human review", required: true },
		],
		...over,
	};
}

function readyCircuit(
	over: Partial<ExecutionCircuitSpec> = {},
): ExecutionCircuitSpec {
	return {
		version: 1,
		id: "c1",
		taskId: "task-1",
		title: "Test circuit",
		status: "ready",
		currentState: state("current", "Current"),
		targetState: state("target", "Target"),
		intermediateStates: [],
		transitions: [fullTransition()],
		...over,
	};
}

function draftCircuit(
	over: Partial<ExecutionCircuitSpec> = {},
): ExecutionCircuitSpec {
	return {
		version: 1,
		id: "c0",
		taskId: "task-0",
		title: "Draft",
		status: "draft",
		currentState: state("current", "Current"),
		targetState: state("target", "Target"),
		intermediateStates: [],
		transitions: [],
		...over,
	};
}

describe("validateExecutionCircuitSpec", () => {
	it("accepts a valid minimal draft (no transitions)", () => {
		expect(validateExecutionCircuitSpec(draftCircuit()).ok).toBe(true);
	});
	it("accepts a valid ready circuit", () => {
		const r = validateExecutionCircuitSpec(readyCircuit());
		expect(r.ok).toBe(true);
		expect(r.errors).toHaveLength(0);
	});
	it("rejects missing current state", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({ currentState: undefined as unknown as StateSpec }),
		);
		expect(r.ok).toBe(false);
		expect(r.errors.some((e) => e.code === "MISSING_CURRENT_STATE")).toBe(true);
	});
	it("rejects missing target state", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({ targetState: undefined as unknown as StateSpec }),
		);
		expect(r.errors.some((e) => e.code === "MISSING_TARGET_STATE")).toBe(true);
	});
	it("rejects duplicate state ids", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({ intermediateStates: [state("current", "Dup")] }),
		);
		expect(r.errors.some((e) => e.code === "DUPLICATE_STATE_ID")).toBe(true);
	});
	it("rejects duplicate transition ids", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({ transitions: [fullTransition(), fullTransition()] }),
		);
		expect(r.errors.some((e) => e.code === "DUPLICATE_TRANSITION_ID")).toBe(
			true,
		);
	});
	it("rejects unknown fromStateId / toStateId", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({
				transitions: [
					fullTransition({ fromStateId: "nope", toStateId: "nah" }),
				],
			}),
		);
		expect(r.errors.some((e) => e.code === "UNKNOWN_FROM_STATE")).toBe(true);
		expect(r.errors.some((e) => e.code === "UNKNOWN_TO_STATE")).toBe(true);
	});
	it("rejects a ready circuit with zero transitions", () => {
		const r = validateExecutionCircuitSpec(readyCircuit({ transitions: [] }));
		expect(r.errors.some((e) => e.code === "NO_TRANSITIONS")).toBe(true);
	});
	it("rejects ready transition with no events / no validators / empty output", () => {
		const r = validateExecutionCircuitSpec(
			readyCircuit({
				transitions: [
					fullTransition({
						requiredEvents: [],
						validators: [],
						outputContract: { format: "json", requiredFields: [] },
					}),
				],
			}),
		);
		const codes = r.errors.map((e) => e.code);
		expect(codes).toContain("NO_REQUIRED_EVENTS");
		expect(codes).toContain("NO_VALIDATORS");
		expect(codes).toContain("EMPTY_OUTPUT_CONTRACT");
	});
});

describe("computeMonadCompleteness", () => {
	it("low score + missing labels for an empty monad", () => {
		const t = fullTransition({
			runtime: { kind: "unspecified" },
			monad: {
				contextRefs: [],
				tools: [],
				permissions: [],
				constraints: [],
				memoryRefs: [],
				qualityCriteria: [],
			},
			outputContract: { format: "json", requiredFields: [] },
			validators: [],
			requiredEvents: [],
		});
		const r = computeMonadCompleteness(t);
		expect(r.score).toBeLessThan(20);
		expect(r.missing.length).toBeGreaterThan(0);
		expect(r.missing).toContain("Validator");
	});
	it("near-100 when all dimensions present", () => {
		const r = computeMonadCompleteness(fullTransition());
		expect(r.score).toBeGreaterThanOrEqual(90);
		expect(r.missing).toHaveLength(0);
	});
	it("partial when validators missing", () => {
		const r = computeMonadCompleteness(fullTransition({ validators: [] }));
		expect(r.score).toBeGreaterThan(20);
		expect(r.score).toBeLessThan(100);
		expect(r.missing).toContain("Validator");
	});
});

describe("compileTransitionPrompt", () => {
	const prompt = compileTransitionPrompt(readyCircuit(), "t1");

	it("includes all required headings", () => {
		for (const h of [
			"## Role",
			"## Task",
			"## Current State",
			"## Target State",
			"## Required Events",
			"## Runtime Binding",
			"## Execution Monad",
			"## Output Contract",
			"## Validators",
			"## Trace Requirements",
			"## Completion Rules",
		]) {
			expect(prompt).toContain(h);
		}
	});
	it("includes state assertions, events, validators, and JSON shape", () => {
		expect(prompt).toContain("Current assertion");
		expect(prompt).toContain("Target assertion");
		expect(prompt).toContain("inspect context");
		expect(prompt).toContain("human review");
		expect(prompt).toContain('"transition_id"');
	});
	it("never emits undefined or [object Object]", () => {
		expect(prompt).not.toContain("undefined");
		expect(prompt).not.toContain("[object Object]");
	});
	it("throws UnknownTransitionError for an unknown transition id", () => {
		expect(() => compileTransitionPrompt(readyCircuit(), "nope")).toThrow(
			UnknownTransitionError,
		);
	});
});
