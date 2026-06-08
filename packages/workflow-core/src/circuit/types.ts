/**
 * Execution Circuit domain types.
 *
 * The execution circuit is the first-class state-transition layer: a task maps
 * to a {@link ExecutionCircuitSpec} with a set of {@link StateSpec}s, a
 * TargetState, and typed {@link TransitionSpec}s. Each transition carries an
 * {@link ExecutionMonadSpec} describing how the transition is executed (runtime
 * binding), what it must produce (output contract), how that output is checked
 * (validators), and which events it can emit.
 *
 * This is the FOUNDATION slice: pure data shapes + deterministic functions.
 * There is no JS runtime, graph scheduler, or retry logic here.
 */

import type { JsonSchema } from "../types";

/** A single node in the circuit's state machine. */
export interface StateSpec {
	id: string;
	label?: string;
	description?: string;
	/** Marks a terminal state (no outgoing transitions expected). */
	terminal?: boolean;
}

/** A named event a transition can emit (consumed by later runtime work). */
export interface EventSpec {
	id: string;
	label?: string;
	description?: string;
}

/** How a transition is actually executed (agent / skill / tool / manual). */
export interface RuntimeBindingSpec {
	/** Coarse kind, e.g. `"agent"`, `"skill"`, `"tool"`, `"manual"`. */
	kind: string;
	/** Implementation reference (skill slug / agent id / tool ref). */
	ref?: string;
	/** Arbitrary binding configuration. */
	config?: Record<string, unknown>;
}

/** The structured-output contract a transition must satisfy. */
export interface OutputContractSpec {
	/** JSON schema the structured final response must conform to. */
	schema: JsonSchema;
	description?: string;
}

/** A check applied to a transition's output. */
export interface ValidatorSpec {
	id: string;
	/** Validator kind, e.g. `"schema"`, `"assertion"`, `"regex"`. */
	kind: string;
	description?: string;
	config?: Record<string, unknown>;
}

/**
 * The "execution monad" for a transition: the bundle of runtime binding,
 * output contract, validators and events that together describe a typed,
 * checkable unit of work.
 */
export interface ExecutionMonadSpec {
	runtimeBinding?: RuntimeBindingSpec;
	outputContract?: OutputContractSpec;
	validators?: ValidatorSpec[];
	events?: EventSpec[];
}

/** A typed transition between two states. */
export interface TransitionSpec {
	id: string;
	/** Source state id. */
	from: string;
	/** Destination state id. */
	to: string;
	label?: string;
	description?: string;
	/** Optional event id that triggers this transition. */
	event?: string;
	monad: ExecutionMonadSpec;
}

/**
 * A complete execution circuit for a task. The TargetState lives inside the
 * spec (`targetState`), alongside the initial state and the full state +
 * transition set.
 */
export interface ExecutionCircuitSpec {
	id?: string;
	name: string;
	description?: string;
	/** Id of the state execution begins in. */
	initialState: string;
	/** Id of the desired terminal (target) state. */
	targetState: string;
	states: StateSpec[];
	transitions: TransitionSpec[];
}
