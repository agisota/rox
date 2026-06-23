import { describe, expect, test } from "bun:test";
import {
	applyCanvasMutation,
	applyCanvasMutationBatch,
	builtInCanvasCapabilities,
	canvasDocumentSchema,
	createInverseCanvasMutationBatch,
	createLargeCanvasDocument,
	rebaseCanvasMutationBatch,
	sampleCanvasDocument,
} from "./index";

describe("canvas contracts", () => {
	test("accepts the JSON round-tripped fixture", () => {
		const parsed = JSON.parse(JSON.stringify(sampleCanvasDocument));

		expect(canvasDocumentSchema.safeParse(parsed).success).toBe(true);
		expect(parsed).toEqual(sampleCanvasDocument);
	});

	test("rejects duplicate ids and dangling references", () => {
		expect(
			canvasDocumentSchema.safeParse({
				...sampleCanvasDocument,
				nodes: [sampleCanvasDocument.nodes[0], sampleCanvasDocument.nodes[0]],
			}).success,
		).toBe(false);

		expect(
			canvasDocumentSchema.safeParse({
				...sampleCanvasDocument,
				edges: [
					{
						...sampleCanvasDocument.edges[0],
						to: { nodeId: "missing-node", side: "auto" },
					},
				],
			}).success,
		).toBe(false);
	});

	test("keeps the full production capability inventory available", () => {
		const capabilityIds = new Set(
			builtInCanvasCapabilities.map((capability) => capability.id),
		);
		expect(capabilityIds.has("canvas.runAgentOnSelection")).toBe(true);
		expect(capabilityIds.has("canvas.validateMutationReplay")).toBe(true);
		expect(capabilityIds.has("canvas.importJsonCanvas")).toBe(true);
	});
});

describe("canvas mutations", () => {
	test("adds nodes and edges without mutating the source document", () => {
		const nextDocument = applyCanvasMutationBatch(sampleCanvasDocument, {
			id: "batch-add-result",
			canvasId: sampleCanvasDocument.id,
			baseVersion: 0,
			createdAt: "2026-06-17T00:00:00.000Z",
			actor: { id: "test", type: "system" },
			mutations: [
				{
					type: "node.add",
					node: {
						id: "node-result",
						type: "artifact",
						title: "Result",
						position: { x: 720, y: 0 },
						size: { width: 280, height: 160 },
						tags: [],
						locked: false,
						collapsed: false,
						metadata: {},
					},
				},
				{
					type: "edge.add",
					edge: {
						id: "edge-agent-result",
						from: { nodeId: "node-session", side: "right" },
						to: { nodeId: "node-result", side: "left" },
						directed: true,
						metadata: {},
					},
				},
			],
		});

		expect(sampleCanvasDocument.nodes).toHaveLength(2);
		expect(nextDocument.nodes).toHaveLength(3);
		expect(nextDocument.edges).toHaveLength(2);
		expect(canvasDocumentSchema.safeParse(nextDocument).success).toBe(true);
	});

	test("removes dangling edges and group references when a node is deleted", () => {
		const nextDocument = applyCanvasMutation(sampleCanvasDocument, {
			type: "node.delete",
			nodeId: "node-note",
		});

		expect(nextDocument.nodes.map((node) => node.id)).toEqual(["node-session"]);
		expect(nextDocument.edges).toEqual([]);
	});

	test("throws on invalid mutation results", () => {
		expect(() =>
			applyCanvasMutation(sampleCanvasDocument, {
				type: "node.update",
				nodeId: "missing",
				patch: { title: "Missing" },
			}),
		).toThrow("Canvas item not found: missing");
	});

	test("creates renderer-neutral inverse and rebased mutation batches", () => {
		const moveBatch = {
			id: "move-batch",
			canvasId: sampleCanvasDocument.id,
			baseVersion: 0,
			createdAt: "2026-06-17T00:00:00.000Z",
			actor: { id: "test", type: "system" as const },
			mutations: [
				{
					type: "node.update" as const,
					nodeId: "node-note",
					patch: { position: { x: 900, y: 320 } },
				},
			],
		};

		const inverse = createInverseCanvasMutationBatch({
			document: sampleCanvasDocument,
			batch: moveBatch,
			baseVersion: 1,
			actorId: "history-undo",
			createId: () => "inverse-batch",
			now: () => "2026-06-17T00:00:01.000Z",
		});

		expect(inverse).toMatchObject({
			id: "inverse-batch",
			baseVersion: 1,
			actor: { id: "history-undo" },
			mutations: [
				{
					type: "node.update",
					nodeId: "node-note",
					patch: { position: sampleCanvasDocument.nodes[1]?.position },
				},
			],
		});

		const rebased = rebaseCanvasMutationBatch({
			batch: moveBatch,
			baseVersion: 8,
			actorId: "history-redo",
			createId: () => "redo-batch",
			now: () => "2026-06-17T00:00:02.000Z",
		});

		expect(rebased).toMatchObject({
			id: "redo-batch",
			baseVersion: 8,
			createdAt: "2026-06-17T00:00:02.000Z",
			actor: { id: "history-redo" },
		});
	});

	test("validates and replays large canvas mutation batches deterministically", () => {
		const largeDocument = createLargeCanvasDocument({
			nodeCount: 250,
			edgeCount: 320,
		});
		const batch = {
			id: "large-move-batch",
			canvasId: largeDocument.id,
			baseVersion: 0,
			createdAt: "2026-06-17T00:00:00.000Z",
			actor: { id: "large-fixture", type: "system" as const },
			mutations: [
				{
					type: "node.update" as const,
					nodeId: "large-node-042",
					patch: { position: { x: 4242, y: 2424 } },
				},
				{
					type: "node.update" as const,
					nodeId: "large-node-177",
					patch: { tags: ["large", "reviewed"] },
				},
			],
		};

		expect(canvasDocumentSchema.safeParse(largeDocument).success).toBe(true);

		const startedAt = performance.now();
		const patchedDocument = applyCanvasMutationBatch(largeDocument, batch);
		const elapsedMs = performance.now() - startedAt;
		const replayedDocument = [batch].reduce(
			(document, nextBatch) => applyCanvasMutationBatch(document, nextBatch),
			largeDocument,
		);

		expect(elapsedMs).toBeLessThan(5000);
		expect(patchedDocument).toEqual(replayedDocument);
		expect(
			patchedDocument.nodes.find((node) => node.id === "large-node-042")
				?.position,
		).toEqual({ x: 4242, y: 2424 });
		expect(
			largeDocument.nodes.find((node) => node.id === "large-node-042")
				?.position,
		).not.toEqual({ x: 4242, y: 2424 });
		expect(patchedDocument.nodes).toHaveLength(250);
		expect(patchedDocument.edges).toHaveLength(320);
	});
});
