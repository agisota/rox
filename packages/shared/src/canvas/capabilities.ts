import type { CanvasCapability, CanvasCapabilityRisk } from "./schema";

type CanvasCapabilityDefinition = Omit<
	CanvasCapability,
	"risks" | "requiresSelection" | "emitsMutation"
> & {
	risks?: CanvasCapabilityRisk[];
	requiresSelection?: boolean;
	emitsMutation?: boolean;
};

const capabilityDefinitions: CanvasCapabilityDefinition[] = [
	{
		id: "canvas.zoomToFit",
		label: "Zoom to fit",
		description:
			"Fit the full CanvasDocument graph projection into the viewport.",
	},
	{
		id: "canvas.zoomToSelection",
		label: "Zoom to selection",
		description:
			"Fit selected CanvasNode, CanvasEdge, and CanvasGroup entities into the viewport.",
		requiresSelection: true,
	},
	{
		id: "canvas.focusNode",
		label: "Focus node",
		description:
			"Center the renderer projection on one CanvasNode entity without mutating canonical state.",
		requiresSelection: true,
	},
	{
		id: "canvas.openLinkedSession",
		label: "Open linked session",
		description:
			"Resolve a session CanvasNodeRef and open the linked Rox chat/session entity.",
		requiresSelection: true,
	},
	{
		id: "canvas.openLinkedNote",
		label: "Open linked note",
		description:
			"Resolve a note CanvasNodeRef and open the linked note/file entity.",
		requiresSelection: true,
	},
	{
		id: "canvas.openLinkedArtifact",
		label: "Open linked artifact",
		description:
			"Resolve an artifact CanvasNodeRef and open the linked generated artifact entity.",
		requiresSelection: true,
	},
	{
		id: "canvas.autoLayout",
		label: "Auto layout",
		description:
			"Generate CanvasMutation batches that update CanvasNode and CanvasGroup positions.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.cleanLayout",
		label: "Clean layout",
		description:
			"Normalize CanvasNode spacing and CanvasEdge crossings through mutation batches.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.alignLeft",
		label: "Align left",
		description:
			"Align selected CanvasNode positions to the leftmost selected x coordinate.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.alignCenter",
		label: "Align center",
		description:
			"Align selected CanvasNode centers while preserving node sizes.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.alignRight",
		label: "Align right",
		description:
			"Align selected CanvasNode positions to the rightmost selected edge.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.distributeHorizontal",
		label: "Distribute horizontally",
		description:
			"Evenly distribute selected CanvasNode entities along the x axis.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.distributeVertical",
		label: "Distribute vertically",
		description:
			"Evenly distribute selected CanvasNode entities along the y axis.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.groupSelection",
		label: "Group selection",
		description:
			"Create a CanvasGroup entity around selected CanvasNode entities.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.ungroupSelection",
		label: "Ungroup selection",
		description:
			"Delete selected CanvasGroup entities and clear CanvasNode.groupId links.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.captureSession",
		label: "Capture session",
		description:
			"Create a chat-session CanvasNode backed by a session CanvasNodeRef.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureMessage",
		label: "Capture message",
		description:
			"Create a message CanvasNode backed by a message CanvasNodeRef.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureArtifact",
		label: "Capture artifact",
		description:
			"Create an artifact CanvasNode backed by an artifact CanvasNodeRef.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureFile",
		label: "Capture file",
		description: "Create a file CanvasNode backed by a file CanvasNodeRef.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureUrl",
		label: "Capture URL",
		description: "Create a URL CanvasNode backed by a URL CanvasNodeRef.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureClipboard",
		label: "Capture clipboard",
		description:
			"Create text/file/url CanvasNode entities from clipboard contents.",
		risks: ["write"],
		emitsMutation: true,
	},
	{
		id: "canvas.captureSelectionAsNote",
		label: "Capture selection as note",
		description:
			"Materialize selected Canvas entities as a note-backed CanvasNodeRef.",
		risks: ["write", "agent"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.linkSelectedNodes",
		label: "Link selected nodes",
		description:
			"Create directional CanvasEdge entities between selected CanvasNode entities.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.generateSuggestedEdges",
		label: "Generate suggested edges",
		description:
			"Use selected CanvasNodeRef context to propose missing CanvasEdge relationships.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.showBacklinks",
		label: "Show backlinks",
		description:
			"List CanvasEdge and entity-reference backlinks for selected CanvasNodeRef entities.",
		requiresSelection: true,
	},
	{
		id: "canvas.findOrphans",
		label: "Find orphans",
		description:
			"Return CanvasNode entities without incoming or outgoing CanvasEdge links.",
	},
	{
		id: "canvas.findCycles",
		label: "Find cycles",
		description:
			"Detect directed CanvasEdge cycles in the CanvasDocument graph.",
	},
	{
		id: "canvas.searchText",
		label: "Search text",
		description:
			"Search CanvasDocument title, CanvasNode titles/text, edge labels, group titles, and refs.",
	},
	{
		id: "canvas.searchSemantic",
		label: "Search semantic",
		description:
			"Search CanvasNodeRef-backed entities with semantic retrieval when an index exists.",
		risks: ["agent"],
	},
	{
		id: "canvas.filterByType",
		label: "Filter by type",
		description: "Filter renderer projection by CanvasNode.type.",
	},
	{
		id: "canvas.filterByTag",
		label: "Filter by tag",
		description:
			"Filter renderer projection by CanvasDocument and CanvasNode tags.",
	},
	{
		id: "canvas.filterBySession",
		label: "Filter by session",
		description:
			"Filter renderer projection by session-backed CanvasNodeRef.workspaceId/id fields.",
	},
	{
		id: "canvas.tagSelection",
		label: "Tag selection",
		description:
			"Add tags to selected CanvasNode and CanvasDocument entities through mutations.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.colorSelection",
		label: "Color selection",
		description:
			"Set CanvasNode, CanvasEdge, or CanvasGroup color fields through mutations.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.refreshPreview",
		label: "Refresh preview",
		description:
			"Refresh CanvasNodeRef.preview values from source entities without duplicating source truth.",
		risks: ["write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.runAgentOnSelection",
		label: "Run agent on selection",
		description: "Pass selected CanvasNodeRef context into an agent session.",
		risks: ["agent"],
		requiresSelection: true,
	},
	{
		id: "canvas.summarizeSelection",
		label: "Summarize selection",
		description:
			"Summarize selected CanvasNodeRef-backed entities into a note or artifact.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.extractTasks",
		label: "Extract tasks",
		description:
			"Create task-backed CanvasNode entities from selected graph context.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.createPlanFromCluster",
		label: "Create plan from cluster",
		description:
			"Convert selected CanvasGroup/CanvasNode cluster context into a plan artifact or task nodes.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.compareSelectedSessions",
		label: "Compare selected sessions",
		description:
			"Compare selected session CanvasNodeRef entities and return differences as an artifact/note.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.generatePromptFromSelection",
		label: "Generate prompt from selection",
		description:
			"Generate a prompt-backed CanvasNode from selected graph context.",
		risks: ["agent", "write"],
		requiresSelection: true,
		emitsMutation: true,
	},
	{
		id: "canvas.explainGraph",
		label: "Explain graph",
		description:
			"Explain CanvasNodeRef relationships, CanvasEdge direction, and group structure.",
		risks: ["agent"],
	},
	{
		id: "canvas.detectContradictions",
		label: "Detect contradictions",
		description:
			"Analyze selected CanvasNodeRef-backed content for contradictions and return evidence.",
		risks: ["agent"],
		requiresSelection: true,
	},
	{
		id: "canvas.exportJsonCanvas",
		label: "Export JSON Canvas",
		description:
			"Export supported CanvasDocument graph fields as Obsidian JSON Canvas.",
		risks: ["export"],
	},
	{
		id: "canvas.exportMarkdownMap",
		label: "Export Markdown map",
		description:
			"Export CanvasDocument nodes, edges, groups, and refs as a Markdown graph map.",
		risks: ["export"],
	},
	{
		id: "canvas.exportBundle",
		label: "Export bundle",
		description:
			"Export canvas.json, patches, snapshots, assets, and index metadata as a Rox bundle.",
		risks: ["export"],
	},
	{
		id: "canvas.exportSelection",
		label: "Export selection",
		description:
			"Export selected CanvasNode, CanvasEdge, CanvasGroup, and CanvasNodeRef data.",
		risks: ["export"],
		requiresSelection: true,
	},
	{
		id: "canvas.importJsonCanvas",
		label: "Import JSON Canvas",
		description:
			"Import Obsidian JSON Canvas into Rox CanvasDocument entities with a lossy-field report.",
		risks: ["import", "write"],
		emitsMutation: true,
	},
	{
		id: "canvas.importMarkdownAsNodes",
		label: "Import Markdown as nodes",
		description:
			"Create CanvasNode entities from Markdown headings, links, and sections.",
		risks: ["import", "write"],
		emitsMutation: true,
	},
	{
		id: "canvas.importSessionAsCanvas",
		label: "Import session as canvas",
		description:
			"Create session/message/artifact CanvasNodeRef graph from a Rox chat session.",
		risks: ["import", "write"],
		emitsMutation: true,
	},
	{
		id: "canvas.importBundle",
		label: "Import bundle",
		description:
			"Import a Rox canvas bundle containing document, patches, snapshots, and assets.",
		risks: ["import", "write"],
		emitsMutation: true,
	},
	{
		id: "canvas.validateDocument",
		label: "Validate document",
		description:
			"Validate a CanvasDocument against the canonical schema and entity references.",
	},
	{
		id: "canvas.validateRefs",
		label: "Validate refs",
		description:
			"Validate CanvasNodeRef entities against workspace/session/file access scope.",
	},
	{
		id: "canvas.validateSecurityScope",
		label: "Validate security scope",
		description:
			"Validate that CanvasNodeRef paths and workspace ids stay inside authorized scope.",
	},
	{
		id: "canvas.validateJsonCanvasRoundtrip",
		label: "Validate JSON Canvas roundtrip",
		description:
			"Import/export JSON Canvas and compare supported graph counts plus lossy report.",
	},
	{
		id: "canvas.validateMutationReplay",
		label: "Validate mutation replay",
		description:
			"Replay CanvasMutation batches from base document and compare to canonical canvas.json.",
	},
	{
		id: "canvas.validateIndex",
		label: "Validate index",
		description:
			"Compare SQLite canvas index rows with canonical CanvasDocument summaries.",
	},
];

export const builtInCanvasCapabilities: CanvasCapability[] =
	capabilityDefinitions.map((capability) => ({
		risks: ["read"],
		requiresSelection: false,
		emitsMutation: false,
		...capability,
	}));
