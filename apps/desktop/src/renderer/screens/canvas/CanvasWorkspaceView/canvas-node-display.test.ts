import { describe, expect, it } from "bun:test";
import type { CanvasDocument, CanvasNode } from "@rox/shared/canvas";
import {
	canvasEntityTypeLabels,
	documentNodesToCards,
	productionCanvasNodeTypes,
} from "./canvas-node-display";

const allNodeTypes = [
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

describe("canvas node display mapping", () => {
	it("covers every production CanvasNode type in the workbench presentation layer", () => {
		expect(productionCanvasNodeTypes).toEqual(allNodeTypes);
		expect(canvasEntityTypeLabels).toEqual([
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
		]);
	});

	it("creates safe card summaries for every production CanvasNode type", () => {
		const document: CanvasDocument = {
			version: 1,
			id: "canvas-node-display",
			workspaceId: "workspace-1",
			title: "Node display canvas",
			createdAt: "2026-06-17T00:00:00.000Z",
			updatedAt: "2026-06-17T00:00:00.000Z",
			tags: [],
			metadata: {},
			nodes: allNodeTypes.map((type, index) => ({
				id: `${type}-node`,
				type,
				position: { x: index * 24, y: index * 16 },
				size: { width: 240, height: 140 },
				title: `${type} title`,
				text: type === "text" || type === "code" ? `${type} body` : undefined,
				ref:
					type === "text"
						? undefined
						: {
								type:
									type === "chat-session"
										? "session"
										: type === "image" || type === "pdf" || type === "code"
											? "file"
											: type,
								id: `${type}-ref`,
								workspaceId: "workspace-1",
								preview: `${type} preview`,
							},
				tags: [],
				locked: false,
				collapsed: false,
				metadata: {},
			})),
			edges: [],
			groups: [],
		};

		const cards = documentNodesToCards(document);

		expect(cards).toHaveLength(allNodeTypes.length);
		expect(cards.map((card) => card.id)).toEqual(
			allNodeTypes.map((type) => `${type}-node`),
		);
		for (const card of cards) {
			expect(card.label).not.toBe("");
			expect(card.title).not.toBe("");
			expect(card.meta).not.toBe("");
			expect(card.className).toContain("border-");
		}
		expect(cards.find((card) => card.id === "image-node")?.meta).toBe(
			"file ref · image-ref",
		);
		expect(cards.find((card) => card.id === "text-node")?.meta).toBe(
			"text node · CanvasDocument entity",
		);
	});
});
