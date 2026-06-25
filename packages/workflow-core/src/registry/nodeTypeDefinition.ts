import type { z } from "zod";
import type { WorkflowIssue } from "../errors";
import type { RoxBlockState, RoxWorkflowState } from "../types";
import type { NodeCategory } from "./nodeCategory";

/**
 * A typed input/output port on a node. `type` is the JSON-Schema `type` keyword
 * for the value flowing through the port, when known (used by the validator's
 * basic port-compat check and by the canvas to colour/label edges).
 */
export interface NodePort {
	/** Stable handle id (e.g. `out`, `true`, `false`, `error`). */
	name: string;
	/** Optional human-facing label for the handle. */
	label?: string;
	/** JSON-Schema `type` of the port's value, when known. */
	type?: string;
	/** Required input ports must be wired for the graph to validate. */
	required?: boolean;
}

/**
 * Field renderer hints for the auto-form (NodeInspector). The registry owns the
 * shape so the inspector renders a config form for ANY registered node type
 * without a hand-written per-type form. Each field maps to one key in
 * `RoxBlockState.subBlocks`.
 *
 * The renderer kinds mirror the controls the five existing hand-forms used:
 * text, number(min/max), select, textarea, boolean, key-value.
 */
export type NodeFieldKind =
	| "text"
	| "number"
	| "select"
	| "textarea"
	| "boolean"
	| "key-value";

export interface NodeFieldDef {
	/** subBlocks key this field reads/writes. */
	key: string;
	/** Control to render. */
	kind: NodeFieldKind;
	/** Field label (RU). */
	label: string;
	/**
	 * Optional section heading (RU) the inspector groups this field under (the
	 * sim.ai right-panel pattern: typed config split into labelled sections such
	 * as "Основные" / "Параметры модели"). Fields with no `section` collapse into
	 * a single default group, so simple node types render a flat form unchanged.
	 * Fields keep their declared order within a section; sections appear in the
	 * order their first field is declared.
	 */
	section?: string;
	/** Optional placeholder / helper hint. */
	placeholder?: string;
	/** Optional helper text shown under the control. */
	description?: string;
	/** Whether the field is required (drives a missing-config validation issue). */
	required?: boolean;
	/** number: inclusive minimum. */
	min?: number;
	/** number: inclusive maximum. */
	max?: number;
	/** number: step. */
	step?: number;
	/** text/textarea: maximum length. */
	maxLength?: number;
	/** select: static options. Dynamic sources (roles/models) use `optionsSource`. */
	options?: { value: string; label: string }[];
	/**
	 * select: a named dynamic option source resolved by the editor (e.g. `roles`,
	 * `models`, `knowledgeBases`). Keeps the registry db-free — the editor binds
	 * the actual data.
	 */
	optionsSource?: string;
}

/** Render metadata for the canvas (icon + accent colour by category/type). */
export interface NodeRenderMeta {
	/** Lucide icon name (resolved to a component by the editor). */
	icon: string;
	/** Tailwind text-colour class for the icon. */
	iconClass: string;
	/** Resolved CSS colour for the MiniMap (no tailwind there). */
	miniMapColor: string;
}

/** Context passed to a node type's optional `validate` hook. */
export interface NodeValidateContext {
	/** The whole graph, for cross-node checks. */
	state: RoxWorkflowState;
}

/**
 * A declarative, data-driven definition of one workflow node type. The canvas
 * palette, node render, NodeInspector auto-form, and `validateGraph` all read
 * from this instead of hard-coding the type. Adding a node type = adding one
 * module that exports a `NodeTypeDefinition` and registers it.
 *
 * Pure + db-free: dynamic select data (roles, models) is bound by the editor via
 * `NodeFieldDef.optionsSource`, never fetched here.
 */
export interface NodeTypeDefinition {
	/** Registry id; also the persisted `RoxBlockState.type`. */
	id: string;
	/** Palette grouping. */
	category: NodeCategory;
	/** Human-facing label (RU). */
	label: string;
	/** Short descriptor for the palette subtitle / node description. */
	description?: string;
	/** Canvas render metadata (icon/colour). */
	render: NodeRenderMeta;
	/** Typed input ports. */
	inputs: NodePort[];
	/** Typed output ports. */
	outputs: NodePort[];
	/** Zod schema for the block's `subBlocks` config. */
	configSchema: z.ZodType;
	/** Auto-form field hints (ordered) for the NodeInspector. */
	fields: NodeFieldDef[];
	/**
	 * Optional helper paragraph (RU) shown at the top of the inspector auto-form,
	 * before the fields (e.g. start's "точка входа", response's terminal note).
	 */
	inspectorHelp?: string;
	/** Whether this node pauses the run awaiting a human decision. */
	pausesRun?: boolean;
	/** This type cannot be added/removed from the palette (e.g. `start`). */
	singleton?: boolean;
	/**
	 * Optional extra validation beyond required-config + ports. Returns issues
	 * (anchored to `blockId` by the caller when omitted).
	 */
	validate?: (
		block: RoxBlockState,
		blockId: string,
		ctx: NodeValidateContext,
	) => WorkflowIssue[];
}
