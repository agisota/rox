/**
 * Shared presentation primitives for the node graph: category accent colours and
 * branch-port tones. Pure + db-free (lives in `@rox/workflow-core` so the web and
 * desktop canvases, the palette, the minimap, and the edge renderer all colour
 * nodes/ports/edges from ONE source of truth instead of each surface hard-coding
 * its own copy).
 *
 * Two colour forms are emitted because the canvas needs both:
 * - a tailwind text/tint class for React nodes (reads design tokens), and
 * - a literal hex for SVG sinks that can't read tokens — the xyflow `<MiniMap>`
 *   `nodeColor` callback and `<BaseEdge stroke>` both render to raw attributes.
 *
 * The hexes intentionally mirror the existing `render.miniMapColor` palette the
 * node modules already declare, keeping the language consistent.
 */

import type { NodeCategory } from "./nodeCategory";
import { NodeCategory as Category } from "./nodeCategory";
import type { NodePort } from "./nodeTypeDefinition";

/** Visual accent for a node category — a tailwind class pair + a raw hex. */
export interface CategoryAccent {
	/** tailwind text-colour class for the node header icon/label. */
	textClass: string;
	/** tailwind background tint class for the node header strip. */
	tintClass: string;
	/** tailwind border-colour class for the header strip / chip. */
	borderClass: string;
	/** Literal CSS colour for SVG sinks (MiniMap node fill). */
	color: string;
}

const NEUTRAL_ACCENT: CategoryAccent = {
	textClass: "text-muted-foreground",
	tintClass: "bg-muted/40",
	borderClass: "border-border",
	color: "#94a3b8",
};

/**
 * Per-category accent map. Colours echo the node modules' `miniMapColor` choices
 * (emerald=Input, terracotta/primary=AI, violet=Logic, sky=Data, amber=Code,
 * rose=Output, teal=Tools) so the palette, nodes, and minimap read as one set.
 */
const CATEGORY_ACCENTS: Record<NodeCategory, CategoryAccent> = {
	[Category.Input]: {
		textClass: "text-emerald-500",
		tintClass: "bg-emerald-500/10",
		borderClass: "border-emerald-500/20",
		color: "#10b981",
	},
	[Category.AI]: {
		textClass: "text-primary",
		tintClass: "bg-primary/10",
		borderClass: "border-primary/20",
		color: "#c4704f",
	},
	[Category.Logic]: {
		textClass: "text-violet-500",
		tintClass: "bg-violet-500/10",
		borderClass: "border-violet-500/20",
		color: "#8b5cf6",
	},
	[Category.Data]: {
		textClass: "text-sky-500",
		tintClass: "bg-sky-500/10",
		borderClass: "border-sky-500/20",
		color: "#0ea5e9",
	},
	[Category.Code]: {
		textClass: "text-amber-500",
		tintClass: "bg-amber-500/10",
		borderClass: "border-amber-500/20",
		color: "#f59e0b",
	},
	[Category.Output]: {
		textClass: "text-rose-500",
		tintClass: "bg-rose-500/10",
		borderClass: "border-rose-500/20",
		color: "#f43f5e",
	},
	[Category.Tools]: {
		textClass: "text-teal-500",
		tintClass: "bg-teal-500/10",
		borderClass: "border-teal-500/20",
		color: "#14b8a6",
	},
};

/** Resolve a category's accent, falling back to a neutral accent. */
export function categoryAccent(category: NodeCategory): CategoryAccent {
	return CATEGORY_ACCENTS[category] ?? NEUTRAL_ACCENT;
}

/**
 * Branch tone of an out-port — the visual meaning the canvas colours edges and
 * port handles by. `success` (true/allowed/approved) reads green, `failure`
 * (false/error/blocked/rejected) reads red, everything else is `neutral`.
 */
export type BranchTone = "success" | "failure" | "neutral";

const SUCCESS_PORTS = new Set(["true", "allowed", "approved", "success"]);
const FAILURE_PORTS = new Set([
	"false",
	"error",
	"blocked",
	"rejected",
	"failure",
]);

/** Map a port handle name to its branch tone (case-insensitive). */
export function branchToneForPort(name: string): BranchTone {
	const key = name.toLowerCase();
	if (SUCCESS_PORTS.has(key)) return "success";
	if (FAILURE_PORTS.has(key)) return "failure";
	return "neutral";
}

/** Branch tone of a typed port (delegates to its handle name). */
export function portTone(port: NodePort): BranchTone {
	return branchToneForPort(port.name);
}

/** Literal colours for each branch tone (SVG edge stroke + handle dot). */
export const BRANCH_TONE_COLOR: Record<BranchTone, string> = {
	success: "#10b981",
	failure: "#f43f5e",
	neutral: "#94a3b8",
};

/** tailwind text-colour class for each branch tone (port labels). */
export const BRANCH_TONE_TEXT_CLASS: Record<BranchTone, string> = {
	success: "text-emerald-500",
	failure: "text-rose-500",
	neutral: "text-muted-foreground",
};

/** Resolve the literal edge/handle colour for a typed port. */
export function portColor(port: NodePort): string {
	return BRANCH_TONE_COLOR[portTone(port)];
}

/** Resolve the literal edge/handle colour for a bare handle name. */
export function branchColorForPort(name: string): string {
	return BRANCH_TONE_COLOR[branchToneForPort(name)];
}
