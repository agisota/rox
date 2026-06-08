/**
 * Minimal render-spec for the circuit diagram kit.
 *
 * This is intentionally a *structural subset* of `@rox/workflow-core`'s
 * `ExecutionCircuitSpec`, defined locally so `@rox/ui` does not depend on the
 * domain package (dependency inversion — Decision #4 in
 * plans/20260608-motion-frame-design-system.md). Callers that have a full
 * `ExecutionCircuitSpec` can pass it straight to `<CircuitCanvas>`; TypeScript
 * structural typing accepts the extra fields.
 */

export interface CircuitStateSpec {
	id: string;
	label?: string;
	terminal?: boolean;
}

export interface CircuitTransitionSpec {
	id: string;
	from: string;
	to: string;
	label?: string;
}

export interface CircuitSpec {
	states: CircuitStateSpec[];
	transitions: CircuitTransitionSpec[];
	initialState: string;
	targetState: string;
}

/** A single structured problem found in a {@link CircuitSpec}. */
export interface CircuitSpecError {
	code: "missing-initial" | "missing-target" | "missing-from" | "missing-to";
	message: string;
}

/**
 * Validate a spec for renderability: every referenced state id must resolve.
 * Returns a structured (possibly empty) list of problems — never throws — so
 * `<CircuitCanvas>` can render a legible fallback instead of crashing.
 */
export function validateCircuitSpec(spec: CircuitSpec): CircuitSpecError[] {
	const errors: CircuitSpecError[] = [];
	const ids = new Set(spec.states.map((s) => s.id));

	if (!ids.has(spec.initialState)) {
		errors.push({
			code: "missing-initial",
			message: `initialState "${spec.initialState}" is not a defined state`,
		});
	}
	if (!ids.has(spec.targetState)) {
		errors.push({
			code: "missing-target",
			message: `targetState "${spec.targetState}" is not a defined state`,
		});
	}
	for (const t of spec.transitions) {
		if (!ids.has(t.from)) {
			errors.push({
				code: "missing-from",
				message: `transition "${t.id}" references unknown from-state "${t.from}"`,
			});
		}
		if (!ids.has(t.to)) {
			errors.push({
				code: "missing-to",
				message: `transition "${t.id}" references unknown to-state "${t.to}"`,
			});
		}
	}
	return errors;
}

/**
 * Deterministic left-to-right order: initial state first, target state last,
 * everything else in declared order. Pure function of the spec, so two renders
 * of the same spec produce identical geometry.
 */
export function orderStates(spec: CircuitSpec): CircuitStateSpec[] {
	const byId = new Map(spec.states.map((s) => [s.id, s]));
	const ordered: CircuitStateSpec[] = [];
	const seen = new Set<string>();

	const push = (id: string) => {
		const state = byId.get(id);
		if (state && !seen.has(id)) {
			seen.add(id);
			ordered.push(state);
		}
	};

	push(spec.initialState);
	for (const state of spec.states) {
		if (state.id !== spec.targetState) {
			push(state.id);
		}
	}
	push(spec.targetState);
	return ordered;
}
