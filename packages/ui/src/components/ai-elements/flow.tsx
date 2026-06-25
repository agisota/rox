"use client";

/**
 * `@rox/ui/ai-elements/flow` — the single import surface for the `@xyflow/react`
 * runtime that the Agent Pipelines canvas needs.
 *
 * `@xyflow/react` is a dependency of `@rox/ui` (it backs the canvas / node / edge
 * primitives). Re-exporting the hooks, helpers, and types here lets consumer apps
 * (apps/web, apps/desktop) wire a full pipeline editor while depending only on
 * `@rox/ui` — they never add `@xyflow/react` to their own package.json. Keep this
 * list lean: export only what the canvas editor actually consumes.
 */

export {
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	Background,
	BaseEdge,
	type Connection,
	type Edge,
	type EdgeChange,
	EdgeLabelRenderer,
	type EdgeProps,
	type EdgeTypes,
	getBezierPath,
	Handle,
	MarkerType,
	MiniMap,
	type Node,
	type NodeChange,
	type NodeProps,
	type NodeTypes,
	type OnConnect,
	Position,
	ReactFlowProvider,
	reconnectEdge,
	useEdgesState,
	useInternalNode,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
