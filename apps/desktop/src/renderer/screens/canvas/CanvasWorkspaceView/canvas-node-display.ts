import type { CanvasDocument, CanvasNode } from "@rox/shared/canvas";
import type { CSSProperties } from "react";

export interface DisplayNodeCard {
	id: string;
	label: string;
	title: string;
	meta: string;
	className?: string;
	style?: CSSProperties;
}

export const productionCanvasNodeTypes = [
	"text",
	"note",
	"chat-session",
	"message",
	"artifact",
	"file",
	"url",
	"image",
	"pdf",
	"code",
	"task",
	"prompt",
	"tool-call",
	"canvas",
] as const satisfies readonly CanvasNode["type"][];

export const canvasEntityTypeLabels = [
	"Text",
	"Note",
	"Chat session",
	"Message",
	"Artifact",
	"File",
	"URL",
	"Image",
	"PDF",
	"Code",
	"Task",
	"Prompt",
	"Tool call",
	"Canvas",
] as const;

const fallbackNodeCards: DisplayNodeCard[] = [
	{
		id: "session",
		label: "Live agent session",
		title: "Claude planning session",
		meta: "Session node · streaming context",
		className: "left-[9%] top-[15%] w-72 border-sky-400/35 bg-sky-950/45",
	},
	{
		id: "note",
		label: "Note",
		title: "Canvas implementation invariants",
		meta: "Note ref · markdown source of truth",
		className: "left-[39%] top-[9%] w-80 border-amber-300/35 bg-amber-950/35",
	},
	{
		id: "artifact",
		label: "Artifact",
		title: "JSON Canvas import report",
		meta: "Artifact ref · generated output",
		className:
			"right-[11%] top-[25%] w-72 border-emerald-300/35 bg-emerald-950/35",
	},
	{
		id: "message",
		label: "Message cluster",
		title: "Selected graph context",
		meta: "6 messages · 3 backlinks",
		className:
			"left-[27%] bottom-[16%] w-72 border-fuchsia-300/35 bg-fuchsia-950/35",
	},
	{
		id: "task",
		label: "Task bundle",
		title: "Storage/RPC verification gates",
		meta: "Task nodes · acceptance matrix",
		className:
			"right-[20%] bottom-[12%] w-80 border-violet-300/35 bg-violet-950/35",
	},
];

function getNodeAccentClass(type: CanvasNode["type"]): string {
	switch (type) {
		case "chat-session":
		case "message":
			return "border-sky-400/35 bg-sky-950/45";
		case "note":
		case "prompt":
			return "border-amber-300/35 bg-amber-950/35";
		case "artifact":
		case "file":
		case "image":
		case "pdf":
		case "code":
			return "border-emerald-300/35 bg-emerald-950/35";
		case "task":
		case "tool-call":
			return "border-violet-300/35 bg-violet-950/35";
		case "url":
		case "canvas":
			return "border-cyan-300/35 bg-cyan-950/35";
		case "text":
			return "border-white/15 bg-slate-950/70";
	}
}

export function documentNodesToCards(
	document?: CanvasDocument,
): DisplayNodeCard[] {
	if (!document) return fallbackNodeCards;
	if (document.nodes.length === 0) {
		return [
			{
				id: "empty-document",
				label: "Persisted CanvasDocument",
				title: document.title,
				meta: "Empty graph · create a node to emit a CanvasMutation batch",
				className:
					"left-[22%] top-[24%] w-96 border-cyan-300/35 bg-cyan-950/35",
			},
		];
	}
	return document.nodes.map((node) => ({
		id: node.id,
		label: node.type,
		title: node.title ?? node.text ?? node.ref?.preview ?? node.id,
		meta: node.ref
			? `${node.ref.type} ref · ${node.ref.id}`
			: `${node.type} node · CanvasDocument entity`,
		className: getNodeAccentClass(node.type),
		style: {
			left: `${Math.max(node.position.x, 24)}px`,
			top: `${Math.max(node.position.y, 72)}px`,
			width: `${node.size?.width ?? 288}px`,
		},
	}));
}
