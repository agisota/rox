/**
 * Deterministic prompt compiler for a single circuit transition. Given a circuit
 * and a transition id, emit a stable prompt string instructing an executor to
 * return a structured JSON final response. No Date / random / locale-dependent
 * formatting — the same inputs always yield byte-identical output (asserted via
 * snapshot tests).
 */

import type { ExecutionCircuitSpec, StateSpec } from "./types";

export interface CompiledTransitionPrompt {
	transitionId: string;
	prompt: string;
}

/** JSON stringify with recursively sorted object keys for stable output. */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value) ?? "null";
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const entries = Object.keys(value as Record<string, unknown>)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${stableStringify(
					(value as Record<string, unknown>)[key],
				)}`,
		);
	return `{${entries.join(",")}}`;
}

function describeState(state: StateSpec | undefined, id: string): string {
	if (!state) return `${id} (undeclared)`;
	const label = state.label ?? state.id;
	return state.description ? `${label} — ${state.description}` : label;
}

/**
 * Build the deterministic transition prompt. Throws if the transition id is not
 * found (programmer error — callers validate ids first).
 */
export function compileTransitionPrompt(
	circuit: ExecutionCircuitSpec,
	transitionId: string,
): CompiledTransitionPrompt {
	const transition = circuit.transitions.find((t) => t.id === transitionId);
	if (!transition) {
		throw new Error(
			`Transition "${transitionId}" not found in circuit "${circuit.name}"`,
		);
	}

	const stateById = new Map(circuit.states.map((s) => [s.id, s]));
	const lines: string[] = [];

	lines.push("You are executing a typed transition in an execution circuit.");
	lines.push("");
	lines.push(`Circuit: ${circuit.name}`);
	lines.push(
		`Transition: ${transition.id} (${transition.from} -> ${transition.to})`,
	);
	if (transition.label) lines.push(`Intent: ${transition.label}`);
	if (transition.description)
		lines.push(`Description: ${transition.description}`);
	lines.push(
		`From state: ${describeState(stateById.get(transition.from), transition.from)}`,
	);
	lines.push(
		`To state: ${describeState(stateById.get(transition.to), transition.to)}`,
	);
	if (transition.event) lines.push(`Triggering event: ${transition.event}`);

	const binding = transition.monad.runtimeBinding;
	if (binding) {
		lines.push(
			`Runtime binding: ${binding.kind}${binding.ref ? ` (${binding.ref})` : ""}`,
		);
	}

	const validators = transition.monad.validators ?? [];
	if (validators.length > 0) {
		lines.push("Validators (output must satisfy all):");
		for (const validator of [...validators].sort((a, b) =>
			a.id.localeCompare(b.id),
		)) {
			lines.push(
				`- ${validator.id} [${validator.kind}]${validator.description ? `: ${validator.description}` : ""}`,
			);
		}
	}

	lines.push("");
	const contract = transition.monad.outputContract;
	if (contract) {
		if (contract.description) lines.push(contract.description);
		lines.push(
			"Respond with a single JSON object conforming to this JSON schema:",
		);
		lines.push(stableStringify(contract.schema));
	} else {
		lines.push(
			'Respond with a single JSON object: {"status":"completed","summary":<string>}.',
		);
	}
	lines.push(
		"Output only the JSON object, with no commentary before or after it.",
	);

	return { transitionId: transition.id, prompt: lines.join("\n") };
}
