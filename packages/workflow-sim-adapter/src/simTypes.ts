/**
 * Minimal structural types for Sim's `WorkflowState`, enough to import a Sim
 * workflow JSON without depending on the Sim app. Sim owns the canonical shape;
 * this captures the fields we convert.
 */
export interface SimBlockState {
	id?: string;
	type: string;
	name?: string;
	position?: { x: number; y: number };
	enabled?: boolean;
	subBlocks?: Record<string, unknown>;
	outputs?: Record<string, unknown>;
	/** For Sim's workflow (child-workflow) block: the referenced workflow. */
	data?: Record<string, unknown>;
}

export interface SimEdge {
	id?: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
}

export interface SimWorkflowState {
	blocks: Record<string, SimBlockState>;
	edges: SimEdge[];
	loops?: Record<string, { nodes: string[]; iterations?: number }>;
	parallels?: Record<string, { nodes: string[] }>;
	variables?: Record<string, { type?: string; value?: unknown }>;
	metadata?: { name?: string; description?: string };
}
