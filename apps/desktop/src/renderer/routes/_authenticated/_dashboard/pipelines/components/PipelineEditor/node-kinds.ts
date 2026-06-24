/**
 * Single source of truth for the canvas node-kind taxonomy: RU labels, accent
 * colours, icons, and the palette ordering. Centralising this keeps the toolbar,
 * the cmdk add-node palette, the MiniMap colour map, and the inspector visually
 * consistent (dify/sim parity) instead of each surface hard-coding its own copy.
 */

import {
	Bot,
	Flag,
	type LucideIcon,
	Play,
	Repeat,
	ShieldCheck,
} from "lucide-react";
import type { PipelineNodeKind } from "./graph-adapter";

/** Kinds the user can add from the palette (start is implicit / single). */
export const ADDABLE_NODE_KINDS = [
	"agent_run",
	"loop",
	"human_approval",
	"response",
] as const satisfies readonly PipelineNodeKind[];

export type AddableNodeKind = (typeof ADDABLE_NODE_KINDS)[number];

type NodeKindMeta = {
	/** RU label shown on the node header and palette. */
	label: string;
	/** Short RU descriptor (palette subtitle / node description). */
	description: string;
	icon: LucideIcon;
	/** Tailwind text-colour class for the icon. */
	iconClass: string;
	/** Resolved CSS colour used by the MiniMap (no tailwind there). */
	miniMapColor: string;
};

/**
 * Per-kind presentation metadata. `miniMapColor` uses literal colours because
 * the xyflow `<MiniMap nodeColor>` callback renders to a raw `<rect fill>` and
 * cannot read tailwind tokens.
 */
export const NODE_KIND_META: Record<PipelineNodeKind, NodeKindMeta> = {
	start: {
		label: "Старт",
		description: "Точка входа",
		icon: Play,
		iconClass: "text-emerald-500",
		miniMapColor: "#10b981",
	},
	agent_run: {
		label: "Агент",
		description: "Агент-роль",
		icon: Bot,
		iconClass: "text-primary",
		miniMapColor: "#c4704f",
	},
	loop: {
		label: "Цикл",
		description: "Повтор тела",
		icon: Repeat,
		iconClass: "text-sky-500",
		miniMapColor: "#0ea5e9",
	},
	human_approval: {
		label: "Подтверждение",
		description: "Гейт подтверждения",
		icon: ShieldCheck,
		iconClass: "text-amber-500",
		miniMapColor: "#f59e0b",
	},
	response: {
		label: "Финал",
		description: "Результат пайплайна",
		icon: Flag,
		iconClass: "text-rose-500",
		miniMapColor: "#f43f5e",
	},
};

/** Resolve the MiniMap colour for a rendered node type id (e.g. `pipeline_loop`). */
export function miniMapColorForNodeType(nodeType: string | undefined): string {
	if (nodeType === "pipelineStart") return NODE_KIND_META.start.miniMapColor;
	const kind = nodeType?.replace(/^pipeline_/, "") as PipelineNodeKind;
	return (
		NODE_KIND_META[kind]?.miniMapColor ?? NODE_KIND_META.agent_run.miniMapColor
	);
}
