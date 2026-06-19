import { describe, expect, test } from "bun:test";
import { defaultCircuitForTask } from "./defaultCircuitForTask";
import {
	evaluateCircuitSecurity,
	evaluateTransitionSecurity,
	TransitionSecurityCode,
} from "./evaluateTransitionSecurity";
import type { TransitionSpec } from "./types";

const defaultSpec = defaultCircuitForTask({
	title: "Ship the thing",
	description: "Do the work",
	priority: "high",
});

describe("evaluateTransitionSecurity", () => {
	test("EC-SEC-01: the default circuit is allowed under the default policy", () => {
		const decision = evaluateCircuitSecurity(defaultSpec);
		expect(decision.allowed).toBe(true);
		for (const d of decision.decisions) {
			expect(d.allowed).toBe(true);
		}
	});

	test("EC-SEC-02: a transition with no runtime binding is denied", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: {},
		};
		const decision = evaluateTransitionSecurity(transition);
		expect(decision.allowed).toBe(false);
		expect(decision.violations.map((v) => v.code)).toContain(
			TransitionSecurityCode.RUNTIME_BINDING_MISSING,
		);
	});

	test("EC-SEC-03: an agent transition without an output contract is denied", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: { runtimeBinding: { kind: "agent" } },
		};
		const decision = evaluateTransitionSecurity(transition);
		expect(decision.allowed).toBe(false);
		expect(decision.violations.map((v) => v.code)).toContain(
			TransitionSecurityCode.OUTPUT_CONTRACT_REQUIRED,
		);
	});

	test("EC-SEC-04: a manual transition needs no output contract", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: { runtimeBinding: { kind: "manual" } },
		};
		expect(evaluateTransitionSecurity(transition).allowed).toBe(true);
	});

	test("EC-SEC-05: a runtime kind outside the allowlist is denied", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: { runtimeBinding: { kind: "shell" } },
		};
		const decision = evaluateTransitionSecurity(transition, {
			allowedRuntimeKinds: ["manual", "agent"],
		});
		expect(decision.allowed).toBe(false);
		expect(decision.violations.map((v) => v.code)).toContain(
			TransitionSecurityCode.RUNTIME_KIND_NOT_ALLOWED,
		);
	});

	test("EC-SEC-06: a ref allowlist rejects unlisted refs", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: {
				runtimeBinding: { kind: "skill", ref: "rm-rf" },
				outputContract: { schema: { type: "object" } },
			},
		};
		const decision = evaluateTransitionSecurity(transition, {
			allowedRuntimeRefs: ["safe-skill"],
		});
		expect(decision.allowed).toBe(false);
		expect(decision.violations.map((v) => v.code)).toContain(
			TransitionSecurityCode.RUNTIME_REF_NOT_ALLOWED,
		);
	});

	test("EC-SEC-07: validators can be required via policy", () => {
		const transition: TransitionSpec = {
			id: "t",
			from: "a",
			to: "b",
			monad: {
				runtimeBinding: { kind: "agent" },
				outputContract: { schema: { type: "object" } },
			},
		};
		const decision = evaluateTransitionSecurity(transition, {
			kindsRequiringValidators: ["agent"],
		});
		expect(decision.allowed).toBe(false);
		expect(decision.violations.map((v) => v.code)).toContain(
			TransitionSecurityCode.VALIDATORS_REQUIRED,
		);
	});

	test("EC-SEC-08: decisions are deterministic", () => {
		const a = evaluateCircuitSecurity(defaultSpec);
		const b = evaluateCircuitSecurity(defaultSpec);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});
