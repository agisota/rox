import { describe, expect, test } from "bun:test";
import { sampleCanvasDocument } from "./fixtures";
import {
	applyCanvasMutation,
	applyCanvasMutationBatch,
	canvasDocumentSchema,
	canvasMutationSchema,
	projectCanvasForRenderer,
} from "./index";

describe("canvasDocumentSchema", () => {
	test("accepts a valid renderer-neutral CanvasDocument", () => {
		const parsed = canvasDocumentSchema.parse(sampleCanvasDocument);

		expect(parsed.id).toBe("canvas-production-example");
		expect(parsed.nodes).toHaveLength(2);
	});

	test("rejects edges that point at missing nodes", () => {
		const invalid = {
			...sampleCanvasDocument,
			edges: [
				{
					...sampleCanvasDocument.edges[0],
					to: { nodeId: "missing-node", side: "left" },
				},
			],
		};

		expect(() => canvasDocumentSchema.parse(invalid)).toThrow();
	});
});

describe("Canvas mutations", () => {
	test("rejects invalid mutation payloads", () => {
		expect(() => canvasMutationSchema.parse({ type: "node.add" })).toThrow();
	});

	test("applies mutation batches and keeps the document valid", () => {
		const next = applyCanvasMutationBatch(sampleCanvasDocument, {
			id: "batch-1",
			canvasId: sampleCanvasDocument.id,
			baseVersion: 0,
			createdAt: "2026-06-17T00:00:01.000Z",
			actor: { id: "user-1", type: "user" },
			mutations: [
				{
					type: "node.update",
					nodeId: "node-note",
					patch: {
						position: { x: 640, y: 240 },
						title: "Updated note",
					},
				},
			],
		});

		expect(next.nodes.find((node) => node.id === "node-note")?.title).toBe(
			"Updated note",
		);
		expect(canvasDocumentSchema.parse(next).id).toBe(sampleCanvasDocument.id);
	});

	test("deleting a node removes attached edges", () => {
		const next = applyCanvasMutation(sampleCanvasDocument, {
			type: "node.delete",
			nodeId: "node-session",
		});

		expect(next.nodes).toHaveLength(1);
		expect(next.edges).toHaveLength(0);
	});
});

describe("projectCanvasForRenderer", () => {
	test("projects without renderer-specific imports or types", () => {
		const projection = projectCanvasForRenderer(sampleCanvasDocument);

		expect(projection.nodes[0]).toMatchObject({
			id: "node-session",
			type: "chat-session",
			entityRef: {
				type: "session",
				id: "session-1",
			},
		});
		expect(projection.edges[0]).toMatchObject({
			sourceNodeId: "node-session",
			targetNodeId: "node-note",
		});
	});
});
