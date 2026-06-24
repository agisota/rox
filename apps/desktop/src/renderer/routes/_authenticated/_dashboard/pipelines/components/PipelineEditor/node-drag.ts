/**
 * The native HTML drag-and-drop contract for adding nodes to the canvas.
 *
 * Palette sources (role-library rows, cmdk items, the toolbar palette) call
 * {@link setNodeDragData} in `onDragStart`; the canvas reads it in `onDrop` via
 * {@link readNodeDragData} and drops a node at the cursor (`screenToFlowPosition`).
 * Borrowed from the official @xyflow/react Drag-and-Drop example — no extra deps,
 * just a typed `dataTransfer` payload.
 */

import type { PipelineNodeKind } from "./graph-adapter";

/** Custom MIME type so we only accept our own pipeline-node drags. */
export const NODE_DRAG_MIME = "application/rox-pipeline-node";

/** The payload carried on a palette drag. */
export type NodeDragPayload = {
	kind: PipelineNodeKind;
	/** Role slug for an `agent_run` drag (binds the node to a role). */
	roleSlug?: string;
	/** Human label to seed the new node with. */
	label?: string;
};

/** Write the drag payload onto a `dragstart` event. */
export function setNodeDragData(
	event: React.DragEvent,
	payload: NodeDragPayload,
): void {
	event.dataTransfer.setData(NODE_DRAG_MIME, JSON.stringify(payload));
	event.dataTransfer.effectAllowed = "move";
}

/**
 * Read the drag payload from a `drop`/`dragover` event. Returns null when the
 * drag is not one of ours (so the canvas ignores foreign drags). Tolerates a
 * missing/garbled payload (some browsers withhold data on `dragover`).
 */
export function readNodeDragData(
	event: React.DragEvent,
): NodeDragPayload | null {
	const raw = event.dataTransfer.getData(NODE_DRAG_MIME);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as NodeDragPayload;
		if (typeof parsed?.kind !== "string") return null;
		return parsed;
	} catch {
		return null;
	}
}

/** Whether a drag event carries our node-drag MIME type (cheap dragover check). */
export function isNodeDrag(event: React.DragEvent): boolean {
	return event.dataTransfer.types.includes(NODE_DRAG_MIME);
}
