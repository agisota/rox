import { z } from "zod";

export const CANVAS_DOCUMENT_VERSION = 1;

export const canvasIdSchema = z.string().min(1);
export const canvasEntityIdSchema = z.string().min(1);

export const canvasNodeTypeSchema = z.enum([
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
]);

export const canvasNodeRefTypeSchema = z.enum([
	"workspace",
	"project",
	"session",
	"message",
	"note",
	"artifact",
	"file",
	"url",
	"task",
	"prompt",
	"tool-call",
	"canvas",
]);

export const canvasColorSchema = z.object({
	key: z.string().min(1).optional(),
	value: z.string().min(1).optional(),
});

export const canvasPointSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
});

export const canvasSizeSchema = z.object({
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
});

export const canvasNodeRefSchema = z.object({
	type: canvasNodeRefTypeSchema,
	id: canvasEntityIdSchema,
	workspaceId: z.string().min(1).optional(),
	projectId: z.string().min(1).optional(),
	path: z.string().min(1).optional(),
	url: z.string().url().optional(),
	version: z.string().min(1).optional(),
	preview: z.string().optional(),
});

export const canvasNodeSchema = z.object({
	id: canvasEntityIdSchema,
	type: canvasNodeTypeSchema,
	position: canvasPointSchema,
	size: canvasSizeSchema.optional(),
	title: z.string().optional(),
	text: z.string().optional(),
	ref: canvasNodeRefSchema.optional(),
	color: canvasColorSchema.optional(),
	tags: z.array(z.string().min(1)).default([]),
	groupId: z.string().min(1).optional(),
	locked: z.boolean().default(false),
	collapsed: z.boolean().default(false),
	createdAt: z.string().min(1).optional(),
	updatedAt: z.string().min(1).optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const canvasEdgeEndpointSchema = z.object({
	nodeId: canvasEntityIdSchema,
	side: z.enum(["top", "right", "bottom", "left", "auto"]).default("auto"),
});

export const canvasEdgeSchema = z.object({
	id: canvasEntityIdSchema,
	from: canvasEdgeEndpointSchema,
	to: canvasEdgeEndpointSchema,
	label: z.string().optional(),
	color: canvasColorSchema.optional(),
	directed: z.boolean().default(true),
	createdAt: z.string().min(1).optional(),
	updatedAt: z.string().min(1).optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const canvasGroupSchema = z.object({
	id: canvasEntityIdSchema,
	title: z.string().optional(),
	position: canvasPointSchema,
	size: canvasSizeSchema,
	color: canvasColorSchema.optional(),
	collapsed: z.boolean().default(false),
	nodeIds: z.array(canvasEntityIdSchema).default([]),
	createdAt: z.string().min(1).optional(),
	updatedAt: z.string().min(1).optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const canvasDocumentSchema = z
	.object({
		version: z.literal(CANVAS_DOCUMENT_VERSION),
		id: canvasIdSchema,
		workspaceId: z.string().min(1),
		projectId: z.string().min(1).optional(),
		title: z.string().min(1),
		description: z.string().optional(),
		nodes: z.array(canvasNodeSchema).default([]),
		edges: z.array(canvasEdgeSchema).default([]),
		groups: z.array(canvasGroupSchema).default([]),
		tags: z.array(z.string().min(1)).default([]),
		createdAt: z.string().min(1),
		updatedAt: z.string().min(1),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((document, ctx) => {
		const nodeIds = new Set<string>();
		for (const node of document.nodes) {
			if (nodeIds.has(node.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate canvas node id: ${node.id}`,
					path: ["nodes"],
				});
			}
			nodeIds.add(node.id);
		}

		const edgeIds = new Set<string>();
		for (const edge of document.edges) {
			if (edgeIds.has(edge.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate canvas edge id: ${edge.id}`,
					path: ["edges"],
				});
			}
			edgeIds.add(edge.id);
			if (!nodeIds.has(edge.from.nodeId)) {
				ctx.addIssue({
					code: "custom",
					message: `Canvas edge ${edge.id} references missing source node ${edge.from.nodeId}`,
					path: ["edges", edge.id, "from"],
				});
			}
			if (!nodeIds.has(edge.to.nodeId)) {
				ctx.addIssue({
					code: "custom",
					message: `Canvas edge ${edge.id} references missing target node ${edge.to.nodeId}`,
					path: ["edges", edge.id, "to"],
				});
			}
		}

		const groupIds = new Set<string>();
		for (const group of document.groups) {
			if (groupIds.has(group.id)) {
				ctx.addIssue({
					code: "custom",
					message: `Duplicate canvas group id: ${group.id}`,
					path: ["groups"],
				});
			}
			groupIds.add(group.id);
			for (const nodeId of group.nodeIds) {
				if (!nodeIds.has(nodeId)) {
					ctx.addIssue({
						code: "custom",
						message: `Canvas group ${group.id} references missing node ${nodeId}`,
						path: ["groups", group.id, "nodeIds"],
					});
				}
			}
		}

		for (const node of document.nodes) {
			if (node.groupId && !groupIds.has(node.groupId)) {
				ctx.addIssue({
					code: "custom",
					message: `Canvas node ${node.id} references missing group ${node.groupId}`,
					path: ["nodes", node.id, "groupId"],
				});
			}
		}
	});

export const canvasCapabilityRiskSchema = z.enum([
	"read",
	"write",
	"agent",
	"export",
	"import",
	"destructive",
]);

export const canvasCapabilitySchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	description: z.string().optional(),
	risks: z.array(canvasCapabilityRiskSchema).default(["read"]),
	nodeTypes: z.array(canvasNodeTypeSchema).optional(),
	requiresSelection: z.boolean().default(false),
	emitsMutation: z.boolean().default(false),
});

export type CanvasId = z.infer<typeof canvasIdSchema>;
export type CanvasNodeType = z.infer<typeof canvasNodeTypeSchema>;
export type CanvasNodeRefType = z.infer<typeof canvasNodeRefTypeSchema>;
export type CanvasNodeRef = z.infer<typeof canvasNodeRefSchema>;
export type CanvasPoint = z.infer<typeof canvasPointSchema>;
export type CanvasSize = z.infer<typeof canvasSizeSchema>;
export type CanvasColor = z.infer<typeof canvasColorSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdgeEndpoint = z.infer<typeof canvasEdgeEndpointSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasGroup = z.infer<typeof canvasGroupSchema>;
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;
export type CanvasCapabilityRisk = z.infer<typeof canvasCapabilityRiskSchema>;
export type CanvasCapability = z.infer<typeof canvasCapabilitySchema>;
