/**
 * Neutral structural types for the graph core (#01).
 *
 * This file is the *core* layer and MUST NOT import any domain schema file
 * (knowledge.ts, agent.ts, …). The invariant from the L3 shared contract is:
 * the graph core depends on no domain subsystem — domains depend on it.
 *
 * `EntitySourceRef` describes the provenance of a graph node (where the node
 * came from: a capture run, an import batch, a chat conversation, a file, …).
 * The open record tail lets domains attach their own provenance fields without
 * widening the core type. Domain files (e.g. knowledge.ts #03) re-export this as
 * an alias for backwards-compat, so the dependency direction is domain → core.
 */

export type EntitySourceRef = {
	conversationId?: string;
	runId?: string;
	importBatchId?: string;
	filePath?: string;
	url?: string;
	provider?: string;
} & Record<string, unknown>;
