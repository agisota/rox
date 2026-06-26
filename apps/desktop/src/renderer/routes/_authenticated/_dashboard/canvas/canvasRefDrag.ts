import type { CanvasNodeRefType, CanvasNodeType } from "@rox/shared/canvas";

/**
 * MIME-style key carried on `DataTransfer` when a workspace entity (session /
 * note / file / task) is dragged onto the canvas. Native HTML5 DnD is used so
 * no extra dependency is required; the payload is a JSON-encoded
 * {@link CanvasRefDragPayload}. The contract lives here as shared core so both
 * the draggable source lists and the canvas drop-zone agree on the shape.
 */
export const CANVAS_REF_DRAG_MIME = "application/rox-canvas-ref";

/**
 * Subset of `CanvasNodeRefType` that maps to entities exposed as draggable
 * sources in workspace lists. The canvas drop handler turns each of these into
 * a ref-node whose `ref.type` matches.
 */
export type CanvasRefDragType = Extract<
	CanvasNodeRefType,
	"session" | "note" | "file" | "task"
>;

export interface CanvasRefDragPayload {
	/** Entity kind; drives the created node's `ref.type` and node `type`. */
	refType: CanvasRefDragType;
	/** Stable entity id persisted into `ref.id`. */
	refId: string;
	/** Human label shown on the node and used as `ref.preview`. */
	label: string;
	/** Optional filesystem-style path for file refs (`ref.path`). */
	path?: string;
}

/** Mapping from drag entity kind to the `CanvasNode["type"]` used on drop. */
const NODE_TYPE_BY_REF: Record<CanvasRefDragType, CanvasNodeType> = {
	session: "chat-session",
	note: "note",
	file: "file",
	task: "task",
};

export function canvasNodeTypeForRef(
	refType: CanvasRefDragType,
): CanvasNodeType {
	return NODE_TYPE_BY_REF[refType];
}

/**
 * Serialise a drag payload onto a `DataTransfer`. Call from a source list's
 * `onDragStart`. Sets `effectAllowed` to `copy` so the canvas shows the copy
 * cursor, and mirrors the label as `text/plain` for non-canvas drop targets.
 */
export function setCanvasRefDragData(
	dataTransfer: DataTransfer,
	payload: CanvasRefDragPayload,
): void {
	dataTransfer.setData(CANVAS_REF_DRAG_MIME, JSON.stringify(payload));
	dataTransfer.setData("text/plain", payload.label);
	dataTransfer.effectAllowed = "copy";
}

/**
 * Read and validate a canvas-ref payload from a drop event's `DataTransfer`.
 * Returns `null` when the drag did not originate from a workspace entity (so
 * unrelated drops fall through to existing behaviour).
 */
export function readCanvasRefDragData(
	dataTransfer: DataTransfer | null,
): CanvasRefDragPayload | null {
	if (!dataTransfer) return null;
	const raw = dataTransfer.getData(CANVAS_REF_DRAG_MIME);
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isCanvasRefDragPayload(parsed)) return null;
	return parsed;
}

/** True when `dataTransfer` carries a canvas-ref drag (cheap dragover check). */
export function hasCanvasRefDragType(
	dataTransfer: DataTransfer | null,
): boolean {
	if (!dataTransfer) return false;
	return Array.from(dataTransfer.types).includes(CANVAS_REF_DRAG_MIME);
}

function isCanvasRefDragPayload(value: unknown): value is CanvasRefDragPayload {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.refId !== "string" || candidate.refId.length === 0) {
		return false;
	}
	if (typeof candidate.label !== "string" || candidate.label.length === 0) {
		return false;
	}
	if (
		candidate.refType !== "session" &&
		candidate.refType !== "note" &&
		candidate.refType !== "file" &&
		candidate.refType !== "task"
	) {
		return false;
	}
	if (candidate.path !== undefined && typeof candidate.path !== "string") {
		return false;
	}
	return true;
}
