import type { CanvasDocument } from "./types";

export const CANVAS_DOCUMENT_FIXTURE: CanvasDocument = {
	schemaVersion: 1,
	id: "canvas-demo",
	title: "Demo canvas",
	nodes: [
		{
			id: "node-prompt",
			type: "prompt",
			title: "Prompt",
			position: { x: 0, y: 0 },
			size: { width: 240, height: 120 },
			data: {
				prompt: "Summarize workspace state",
			},
		},
		{
			id: "node-agent",
			type: "agent",
			title: "Agent",
			position: { x: 360, y: 0 },
			size: { width: 240, height: 120 },
			refs: [{ kind: "node", id: "node-prompt" }],
			data: {
				agentId: "codex",
			},
		},
	],
	edges: [
		{
			id: "edge-prompt-agent",
			type: "flow",
			source: { node: { kind: "node", id: "node-prompt" } },
			target: { node: { kind: "node", id: "node-agent" } },
		},
	],
	groups: [
		{
			id: "group-run",
			type: "stage",
			title: "Run",
			nodeIds: ["node-prompt", "node-agent"],
		},
	],
	capabilities: [
		{ subject: "document", action: "read", enabled: true },
		{ subject: "node", action: "create", enabled: true },
		{ subject: "edge", action: "connect", enabled: true },
	],
	data: {
		viewport: {
			x: 0,
			y: 0,
			zoom: 1,
		},
	},
};
