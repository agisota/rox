import { describe, expect, it } from "bun:test";
import { exportJsonCanvas, importJsonCanvas } from "./json-canvas-codec";

describe("JSON Canvas codec", () => {
	it("imports Obsidian-style text, file, link, group, and edge entities", () => {
		const result = importJsonCanvas({
			canvasId: "canvas-1",
			workspaceId: "workspace-1",
			projectId: "project-1",
			title: "Imported",
			now: "2026-06-17T00:00:00.000Z",
			jsonCanvas: {
				nodes: [
					{
						id: "text-1",
						type: "text",
						x: 10,
						y: 20,
						width: 200,
						height: 120,
						text: "Hello",
					},
					{
						id: "file-1",
						type: "file",
						x: 250,
						y: 20,
						width: 240,
						height: 160,
						file: "docs/spec.md",
					},
					{
						id: "url-1",
						type: "link",
						x: 540,
						y: 20,
						width: 240,
						height: 160,
						url: "https://example.com",
					},
					{
						id: "group-1",
						type: "group",
						x: 0,
						y: 0,
						width: 640,
						height: 320,
						label: "Cluster",
					},
				],
				edges: [
					{
						id: "edge-1",
						fromNode: "text-1",
						toNode: "file-1",
						label: "references",
					},
				],
			},
		});

		expect(result.document.nodes).toHaveLength(3);
		expect(result.document.groups).toHaveLength(1);
		expect(result.document.edges).toHaveLength(1);
		expect(result.report.importedEdges).toBe(1);
	});

	it("exports internal graph back to supported JSON Canvas fields", () => {
		const imported = importJsonCanvas({
			canvasId: "canvas-1",
			workspaceId: "workspace-1",
			title: "Imported",
			now: "2026-06-17T00:00:00.000Z",
			jsonCanvas: {
				nodes: [
					{
						id: "text-1",
						type: "text",
						x: 10,
						y: 20,
						width: 200,
						height: 120,
						text: "Hello",
					},
				],
				edges: [],
			},
		});

		const exported = exportJsonCanvas(imported.document);
		expect(exported.jsonCanvas.nodes).toHaveLength(1);
		expect(exported.jsonCanvas.nodes[0]?.type).toBe("text");
		expect(exported.report.lossy).toEqual([]);
	});

	it("rejects malicious file paths and unsafe link protocols during import", () => {
		const baseArgs = {
			canvasId: "canvas-1",
			workspaceId: "workspace-1",
			title: "Imported",
			now: "2026-06-17T00:00:00.000Z",
		};

		expect(() =>
			importJsonCanvas({
				...baseArgs,
				jsonCanvas: {
					nodes: [
						{
							id: "file-1",
							type: "file",
							x: 0,
							y: 0,
							width: 200,
							height: 100,
							file: "../secrets.env",
						},
					],
					edges: [],
				},
			}),
		).toThrow("JSON Canvas file path is outside the workspace");

		expect(() =>
			importJsonCanvas({
				...baseArgs,
				jsonCanvas: {
					nodes: [
						{
							id: "url-1",
							type: "link",
							x: 0,
							y: 0,
							width: 200,
							height: 100,
							url: "file:///etc/passwd",
						},
					],
					edges: [],
				},
			}),
		).toThrow("JSON Canvas link protocol is not supported");
	});

	it("reports lossy group background fields during import", () => {
		const imported = importJsonCanvas({
			canvasId: "canvas-1",
			workspaceId: "workspace-1",
			title: "Imported",
			now: "2026-06-17T00:00:00.000Z",
			jsonCanvas: {
				nodes: [
					{
						id: "group-1",
						type: "group",
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						label: "Group",
						background: "wallpaper.png",
						backgroundStyle: "cover",
					},
				],
				edges: [],
			},
		});

		expect(imported.report.lossy).toContain("group:group-1:background");
	});
});
