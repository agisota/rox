/**
 * `@rox/ui/circuit` — State-First concept components.
 *
 * The reusable diagram kit that renders a {@link CircuitSpec} (a structural
 * subset of `@rox/workflow-core`'s `ExecutionCircuitSpec`) with the Motion
 * Frame vocabulary. `<CircuitCanvas>` is the keystone; `StateNode` and
 * `TransitionRail` are the SVG atoms it composes.
 */
export {
	CircuitCanvas,
	type CircuitCanvasProps,
} from "./CircuitCanvas";
export {
	type CircuitSpec,
	type CircuitSpecError,
	type CircuitStateSpec,
	type CircuitTransitionSpec,
	orderStates,
	validateCircuitSpec,
} from "./CircuitSpec";
export { StateNode, type StateNodeProps } from "./StateNode";
export { TransitionRail, type TransitionRailProps } from "./TransitionRail";
