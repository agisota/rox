import type { CanvasDocument } from "./schema";

type CreateLargeCanvasDocumentOptions = {
	nodeCount?: number;
	edgeCount?: number;
	workspaceId?: string;
	projectId?: string;
};

export const sampleCanvasDocument: CanvasDocument = {
	version: 1,
	id: "canvas-production-example",
	workspaceId: "workspace-1",
	projectId: "project-1",
	title: "Production Canvas Workspace",
	description: "Renderer-neutral sample for tests and UI smoke wiring.",
	createdAt: "2026-06-17T00:00:00.000Z",
	updatedAt: "2026-06-17T00:00:00.000Z",
	tags: ["canvas", "production"],
	metadata: {},
	nodes: [
		{
			id: "node-session",
			type: "chat-session",
			position: { x: 120, y: 120 },
			size: { width: 300, height: 180 },
			title: "Agent session",
			tags: ["agent"],
			locked: false,
			collapsed: false,
			metadata: {},
			ref: {
				type: "session",
				id: "session-1",
				workspaceId: "workspace-1",
				preview: "Live implementation session",
			},
		},
		{
			id: "node-note",
			type: "note",
			position: { x: 520, y: 110 },
			size: { width: 320, height: 220 },
			title: "Canvas invariants",
			tags: ["architecture"],
			locked: false,
			collapsed: false,
			metadata: {},
			ref: {
				type: "note",
				id: "note-1",
				workspaceId: "workspace-1",
				path: "docs/tickets/production-canvas-workspace.md",
			},
		},
	],
	edges: [
		{
			id: "edge-session-note",
			from: { nodeId: "node-session", side: "right" },
			to: { nodeId: "node-note", side: "left" },
			label: "produces",
			directed: true,
			metadata: {},
		},
	],
	groups: [],
};

export function createLargeCanvasDocument({
	nodeCount = 250,
	edgeCount = 320,
	workspaceId = "workspace-large",
	projectId = "project-large",
}: CreateLargeCanvasDocumentOptions = {}): CanvasDocument {
	const normalizedNodeCount = Math.max(2, Math.floor(nodeCount));
	const normalizedEdgeCount = Math.max(0, Math.floor(edgeCount));
	const nodeId = (index: number) =>
		`large-node-${String(index).padStart(3, "0")}`;
	const nodes: CanvasDocument["nodes"] = Array.from(
		{ length: normalizedNodeCount },
		(_, index) => ({
			id: nodeId(index),
			type: "text",
			position: {
				x: (index % 25) * 320,
				y: Math.floor(index / 25) * 220,
			},
			size: { width: 260, height: 150 },
			title: `Large node ${index}`,
			text: `Large canvas fixture node ${index}`,
			tags: ["large", index % 2 === 0 ? "even" : "odd"],
			locked: false,
			collapsed: false,
			metadata: { fixtureIndex: index },
		}),
	);
	const edges: CanvasDocument["edges"] = Array.from(
		{ length: normalizedEdgeCount },
		(_, index) => {
			const fromIndex = index % normalizedNodeCount;
			const preferredToIndex = (index * 7 + 1) % normalizedNodeCount;
			const toIndex =
				preferredToIndex === fromIndex
					? (fromIndex + 1) % normalizedNodeCount
					: preferredToIndex;

			return {
				id: `large-edge-${String(index).padStart(3, "0")}`,
				from: { nodeId: nodeId(fromIndex), side: "right" },
				to: { nodeId: nodeId(toIndex), side: "left" },
				label: index % 8 === 0 ? `edge ${index}` : undefined,
				directed: true,
				metadata: { fixtureIndex: index },
			};
		},
	);

	return {
		version: 1,
		id: "canvas-large-fixture",
		workspaceId,
		projectId,
		title: "Large Canvas Fixture",
		description:
			"Large renderer-neutral fixture for replay and performance proof.",
		createdAt: "2026-06-17T00:00:00.000Z",
		updatedAt: "2026-06-17T00:00:00.000Z",
		tags: ["canvas", "large", "performance"],
		metadata: {
			nodeCount: normalizedNodeCount,
			edgeCount: normalizedEdgeCount,
		},
		nodes,
		edges,
		groups: [],
	};
}
