import { describe, expect, test } from "bun:test";
import { defaultCircuitForTask } from "./defaultCircuitForTask";
import { planExecutionPath } from "./planExecutionPath";
import type { ExecutionCircuitSpec } from "./types";

const baseSpec: ExecutionCircuitSpec = defaultCircuitForTask({
	title: "Ship the thing",
	description: "Do the work",
	priority: "high",
});

describe("planExecutionPath", () => {
	test("EC-PLAN-01: plans the todo->working->done path for the default circuit", () => {
		const plan = planExecutionPath(baseSpec);
		expect(plan.reachable).toBe(true);
		expect(plan.atTarget).toBe(false);
		expect(plan.steps.map((s) => s.transitionId)).toEqual([
			"start",
			"complete",
		]);
		expect(plan.statePath).toEqual(["todo", "working", "done"]);
	});

	test("EC-PLAN-02: is deterministic for the same input", () => {
		const a = planExecutionPath(baseSpec);
		const b = planExecutionPath(baseSpec);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	test("EC-PLAN-03: reports atTarget when initial equals target", () => {
		const spec: ExecutionCircuitSpec = { ...baseSpec, targetState: "todo" };
		const plan = planExecutionPath(spec);
		expect(plan.reachable).toBe(true);
		expect(plan.atTarget).toBe(true);
		expect(plan.steps).toEqual([]);
		expect(plan.statePath).toEqual(["todo"]);
	});

	test("EC-PLAN-04: reports unreachable target without throwing", () => {
		const spec: ExecutionCircuitSpec = {
			...baseSpec,
			// todo->working only; done is unreachable.
			transitions: baseSpec.transitions.filter((t) => t.id === "start"),
		};
		const plan = planExecutionPath(spec);
		expect(plan.reachable).toBe(false);
		expect(plan.steps).toEqual([]);
		expect(plan.reachableStates).toEqual(["todo", "working"]);
	});

	test("EC-PLAN-05: undeclared endpoints yield unreachable, never throw", () => {
		const spec: ExecutionCircuitSpec = { ...baseSpec, targetState: "ghost" };
		const plan = planExecutionPath(spec);
		expect(plan.reachable).toBe(false);
		expect(plan.steps).toEqual([]);
	});

	test("EC-PLAN-06: picks the shortest path with stable id tie-breaking", () => {
		// Two ways from a->c: direct (a->c via "z-direct") and a->b->c. BFS prefers
		// the single-hop edge; among equal-length options, ids sort deterministically.
		const spec: ExecutionCircuitSpec = {
			name: "diamond",
			initialState: "a",
			targetState: "c",
			states: [{ id: "a" }, { id: "b" }, { id: "c" }],
			transitions: [
				{ id: "a-to-b", from: "a", to: "b", monad: {} },
				{ id: "b-to-c", from: "b", to: "c", monad: {} },
				{ id: "z-direct", from: "a", to: "c", monad: {} },
			],
		};
		const plan = planExecutionPath(spec);
		expect(plan.steps.map((s) => s.transitionId)).toEqual(["z-direct"]);
		expect(plan.statePath).toEqual(["a", "c"]);
	});
});
