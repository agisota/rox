import { z } from "zod";
import {
	CANVAS_DOCUMENT_VERSION,
	type CanvasDocument,
	type CanvasEdge,
	type CanvasGroup,
	type CanvasNode,
	canvasDocumentSchema,
} from "./schema";

const jsonCanvasColorSchema = z.union([
	z.literal("1"),
	z.literal("2"),
	z.literal("3"),
	z.literal("4"),
	z.literal("5"),
	z.literal("6"),
	z.string().regex(/^#[0-9a-fA-F]{6}$/),
]);

const jsonCanvasBaseNodeSchema = z.object({
	id: z.string().min(1),
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
	color: jsonCanvasColorSchema.optional(),
});

const jsonCanvasTextNodeSchema = jsonCanvasBaseNodeSchema.extend({
	type: z.literal("text"),
	text: z.string().optional(),
});

const jsonCanvasFileNodeSchema = jsonCanvasBaseNodeSchema.extend({
	type: z.literal("file"),
	file: z.string().min(1),
	subpath: z.string().optional(),
});

const jsonCanvasLinkNodeSchema = jsonCanvasBaseNodeSchema.extend({
	type: z.literal("link"),
	url: z.string().url(),
});

const jsonCanvasGroupNodeSchema = jsonCanvasBaseNodeSchema.extend({
	type: z.literal("group"),
	label: z.string().optional(),
	background: z.string().optional(),
	backgroundStyle: z.string().optional(),
});

export const jsonCanvasNodeSchema = z.discriminatedUnion("type", [
	jsonCanvasTextNodeSchema,
	jsonCanvasFileNodeSchema,
	jsonCanvasLinkNodeSchema,
	jsonCanvasGroupNodeSchema,
]);

export const jsonCanvasEdgeSchema = z.object({
	id: z.string().min(1),
	fromNode: z.string().min(1),
	fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
	toNode: z.string().min(1),
	toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
	color: jsonCanvasColorSchema.optional(),
	label: z.string().optional(),
});

export const jsonCanvasFileSchema = z.object({
	nodes: z.array(jsonCanvasNodeSchema).default([]),
	edges: z.array(jsonCanvasEdgeSchema).default([]),
});

export type JsonCanvasFile = z.infer<typeof jsonCanvasFileSchema>;

export interface JsonCanvasCodecReport {
	importedNodes: number;
	importedEdges: number;
	importedGroups: number;
	lossy: string[];
	unsupported: string[];
}

function colorToCanvas(color: string | undefined) {
	if (!color) return undefined;
	return color.startsWith("#") ? { value: color } : { key: color };
}

function colorFromCanvas(color: { key?: string; value?: string } | undefined) {
	if (!color) return undefined;
	return color.value ?? color.key;
}

function fileNodeType(file: string): CanvasNode["type"] {
	const lower = file.toLowerCase();
	if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower)) return "image";
	if (/\.pdf$/.test(lower)) return "pdf";
	if (/\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|mdx?)$/.test(lower)) {
		return "code";
	}
	return "file";
}

function assertSafeJsonCanvasFilePath(path: string): void {
	if (
		path.includes("\0") ||
		path.startsWith("/") ||
		/^[A-Za-z]:[\\/]/.test(path) ||
		path.split(/[\\/]+/).includes("..")
	) {
		throw new Error("JSON Canvas file path is outside the workspace");
	}
}

function assertSafeJsonCanvasUrl(url: string): void {
	const parsed = new URL(url);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("JSON Canvas link protocol is not supported");
	}
}

export function importJsonCanvas(args: {
	jsonCanvas: unknown;
	canvasId: string;
	workspaceId: string;
	projectId?: string;
	title: string;
	now?: string;
}): { document: CanvasDocument; report: JsonCanvasCodecReport } {
	const parsed = jsonCanvasFileSchema.parse(args.jsonCanvas);
	const now = args.now ?? new Date().toISOString();
	const report: JsonCanvasCodecReport = {
		importedNodes: 0,
		importedEdges: 0,
		importedGroups: 0,
		lossy: [],
		unsupported: [],
	};
	const groups: CanvasGroup[] = [];
	const nodes: CanvasNode[] = [];

	for (const node of parsed.nodes) {
		if (node.type === "group") {
			groups.push({
				id: node.id,
				title: node.label,
				position: { x: node.x, y: node.y },
				size: { width: node.width, height: node.height },
				color: colorToCanvas(node.color),
				nodeIds: [],
				collapsed: false,
				metadata: {
					jsonCanvas: {
						background: node.background,
						backgroundStyle: node.backgroundStyle,
					},
				},
			});
			if (node.background || node.backgroundStyle) {
				report.lossy.push(`group:${node.id}:background`);
			}
			continue;
		}

		if (node.type === "text") {
			nodes.push({
				id: node.id,
				type: "text",
				position: { x: node.x, y: node.y },
				size: { width: node.width, height: node.height },
				text: node.text,
				title: node.text?.split("\n")[0]?.slice(0, 80),
				color: colorToCanvas(node.color),
				tags: [],
				locked: false,
				collapsed: false,
				metadata: {},
			});
			continue;
		}

		if (node.type === "file") {
			assertSafeJsonCanvasFilePath(node.file);
			if (node.subpath) assertSafeJsonCanvasFilePath(node.subpath);
			nodes.push({
				id: node.id,
				type: fileNodeType(node.file),
				position: { x: node.x, y: node.y },
				size: { width: node.width, height: node.height },
				title: node.file,
				color: colorToCanvas(node.color),
				tags: [],
				locked: false,
				collapsed: false,
				ref: {
					type: "file",
					id: node.file,
					workspaceId: args.workspaceId,
					projectId: args.projectId,
					path: node.subpath ? `${node.file}#${node.subpath}` : node.file,
				},
				metadata: {},
			});
			continue;
		}

		assertSafeJsonCanvasUrl(node.url);
		nodes.push({
			id: node.id,
			type: "url",
			position: { x: node.x, y: node.y },
			size: { width: node.width, height: node.height },
			title: node.url,
			color: colorToCanvas(node.color),
			tags: [],
			locked: false,
			collapsed: false,
			ref: {
				type: "url",
				id: node.url,
				url: node.url,
			},
			metadata: {},
		});
	}

	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges: CanvasEdge[] = [];
	for (const edge of parsed.edges) {
		if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
			report.unsupported.push(`edge:${edge.id}:missing-node`);
			continue;
		}
		edges.push({
			id: edge.id,
			from: { nodeId: edge.fromNode, side: edge.fromSide ?? "auto" },
			to: { nodeId: edge.toNode, side: edge.toSide ?? "auto" },
			label: edge.label,
			color: colorToCanvas(edge.color),
			directed: true,
			metadata: {},
		});
	}

	const document = canvasDocumentSchema.parse({
		version: CANVAS_DOCUMENT_VERSION,
		id: args.canvasId,
		workspaceId: args.workspaceId,
		projectId: args.projectId,
		title: args.title,
		nodes,
		edges,
		groups,
		tags: [],
		createdAt: now,
		updatedAt: now,
		metadata: {
			importedFrom: "json-canvas",
		},
	});
	report.importedNodes = nodes.length;
	report.importedEdges = edges.length;
	report.importedGroups = groups.length;
	return { document, report };
}

export function exportJsonCanvas(document: CanvasDocument): {
	jsonCanvas: JsonCanvasFile;
	report: JsonCanvasCodecReport;
} {
	const report: JsonCanvasCodecReport = {
		importedNodes: document.nodes.length,
		importedEdges: document.edges.length,
		importedGroups: document.groups.length,
		lossy: [],
		unsupported: [],
	};
	const nodes: JsonCanvasFile["nodes"] = [];

	for (const group of document.groups) {
		nodes.push({
			id: group.id,
			type: "group",
			x: group.position.x,
			y: group.position.y,
			width: group.size.width,
			height: group.size.height,
			label: group.title,
			color: colorFromCanvas(group.color),
		});
	}

	for (const node of document.nodes) {
		const width = node.size?.width ?? 280;
		const height = node.size?.height ?? 160;
		if (node.type === "text") {
			nodes.push({
				id: node.id,
				type: "text",
				x: node.position.x,
				y: node.position.y,
				width,
				height,
				color: colorFromCanvas(node.color),
				text: node.text ?? node.title,
			});
			continue;
		}
		if (node.type === "url" && node.ref?.url) {
			nodes.push({
				id: node.id,
				type: "link",
				x: node.position.x,
				y: node.position.y,
				width,
				height,
				color: colorFromCanvas(node.color),
				url: node.ref.url,
			});
			continue;
		}
		if (node.ref?.path || node.ref?.id) {
			nodes.push({
				id: node.id,
				type: "file",
				x: node.position.x,
				y: node.position.y,
				width,
				height,
				color: colorFromCanvas(node.color),
				file: node.ref.path ?? node.ref.id,
			});
			if (node.type !== "file" && node.type !== "note") {
				report.lossy.push(`node:${node.id}:type:${node.type}`);
			}
			continue;
		}
		nodes.push({
			id: node.id,
			type: "text",
			x: node.position.x,
			y: node.position.y,
			width,
			height,
			color: colorFromCanvas(node.color),
			text: node.title ?? node.text ?? node.id,
		});
		report.lossy.push(`node:${node.id}:fallback-text`);
	}

	return {
		jsonCanvas: {
			nodes,
			edges: document.edges.map((edge) => ({
				id: edge.id,
				fromNode: edge.from.nodeId,
				fromSide: edge.from.side === "auto" ? undefined : edge.from.side,
				toNode: edge.to.nodeId,
				toSide: edge.to.side === "auto" ? undefined : edge.to.side,
				color: colorFromCanvas(edge.color),
				label: edge.label,
			})),
		},
		report,
	};
}
