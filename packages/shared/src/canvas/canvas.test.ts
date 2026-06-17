import { describe, expect, test } from "bun:test";
import {
	applyCanvasMutation,
	applyCanvasMutations,
	CANVAS_DOCUMENT_FIXTURE,
	createCanvasEdge,
	createCanvasGroup,
	createCanvasNodeRef,
	isCanvasDocument,
	isCanvasJsonValue,
} from "./index";
import type { CanvasDocument } from "./types";

describe("canvas contracts", () => {
	test("accepts the JSON round-tripped fixture", () => {
		const parsed = JSON.parse(JSON.stringify(CANVAS_DOCUMENT_FIXTURE));

		expect(isCanvasDocument(parsed)).toBe(true);
		expect(parsed).toEqual(CANVAS_DOCUMENT_FIXTURE);
	});

	test("rejects non-JSON node data", () => {
		expect(isCanvasJsonValue({ run: () => "not json" })).toBe(false);
		expect(
			isCanvasDocument({
				...CANVAS_DOCUMENT_FIXTURE,
				nodes: [
					{
						...CANVAS_DOCUMENT_FIXTURE.nodes[0],
						data: { invalid: Number.NaN },
					},
				],
			}),
		).toBe(false);
	});

	test("rejects duplicate ids", () => {
		expect(
			isCanvasDocument({
				...CANVAS_DOCUMENT_FIXTURE,
				nodes: [
					CANVAS_DOCUMENT_FIXTURE.nodes[0],
					CANVAS_DOCUMENT_FIXTURE.nodes[0],
				],
			}),
		).toBe(false);
	});

	test("rejects dangling node, edge, and group references", () => {
		expect(
			isCanvasDocument({
				...CANVAS_DOCUMENT_FIXTURE,
				edges: [
					{
						...CANVAS_DOCUMENT_FIXTURE.edges[0],
						target: { node: { kind: "node", id: "missing-node" } },
					},
				],
			}),
		).toBe(false);

		expect(
			isCanvasDocument({
				...CANVAS_DOCUMENT_FIXTURE,
				nodes: [
					{
						...CANVAS_DOCUMENT_FIXTURE.nodes[0],
						groupId: "missing-group",
					},
				],
			}),
		).toBe(false);

		expect(
			isCanvasDocument({
				...CANVAS_DOCUMENT_FIXTURE,
				groups: [
					{
						...CANVAS_DOCUMENT_FIXTURE.groups[0],
						nodeIds: ["missing-node"],
					},
				],
			}),
		).toBe(false);
	});
});

describe("canvas mutations", () => {
	test("adds nodes and edges without mutating the source document", () => {
		const nextDocument = applyCanvasMutations(CANVAS_DOCUMENT_FIXTURE, [
			{
				type: "node.add",
				node: {
					id: "node-result",
					type: "artifact",
					title: "Result",
					position: { x: 720, y: 0 },
					refs: [createCanvasNodeRef("node-agent")],
				},
			},
			{
				type: "edge.add",
				edge: createCanvasEdge({
					id: "edge-agent-result",
					type: "flow",
					sourceNodeId: "node-agent",
					targetNodeId: "node-result",
				}),
			},
		]);

		expect(CANVAS_DOCUMENT_FIXTURE.nodes).toHaveLength(2);
		expect(nextDocument.nodes).toHaveLength(3);
		expect(nextDocument.edges).toHaveLength(2);
		expect(isCanvasDocument(nextDocument)).toBe(true);
	});

	test("removes dangling edges and group references when a node is removed", () => {
		const nextDocument = applyCanvasMutation(CANVAS_DOCUMENT_FIXTURE, {
			type: "node.remove",
			id: "node-prompt",
		});

		expect(nextDocument.nodes.map((node) => node.id)).toEqual(["node-agent"]);
		expect(nextDocument.edges).toEqual([]);
		expect(nextDocument.groups[0]?.nodeIds).toEqual(["node-agent"]);
	});

	test("sets capabilities by subject and action", () => {
		const nextDocument = applyCanvasMutation(CANVAS_DOCUMENT_FIXTURE, {
			type: "capability.set",
			capability: {
				subject: "node",
				action: "create",
				enabled: false,
				reason: "readonly session",
			},
		});

		expect(
			nextDocument.capabilities?.find(
				(capability) =>
					capability.subject === "node" && capability.action === "create",
			),
		).toMatchObject({ enabled: false, reason: "readonly session" });
	});

	test("creates groups with optional title omitted from JSON when absent", () => {
		const group = createCanvasGroup({
			id: "group-empty",
			type: "stage",
			nodeIds: [],
		});

		expect(group).toEqual({
			id: "group-empty",
			type: "stage",
			nodeIds: [],
		});
	});

	test("throws on invalid mutation results", () => {
		const invalidDocument = {
			...CANVAS_DOCUMENT_FIXTURE,
			nodes: [],
		} satisfies CanvasDocument;

		expect(() =>
			applyCanvasMutation(invalidDocument, {
				type: "node.update",
				id: "missing",
				patch: { title: "Missing" },
			}),
		).toThrow('Cannot find canvas node "missing"');
	});
});
