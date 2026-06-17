/**
 * Message + accumulating-context contract for Agent Pipelines.
 *
 * A pipeline run carries an append-only transcript: the seeding user/system
 * message plus every prior agent node's output. Each `agent_run` node sees the
 * full accumulation rendered into its prompt, and appends its own output for
 * downstream nodes.
 *
 * Persisted on `workflow_runs.accumulatedContext` (see `@rox/db`). Keep entries
 * lean (message text + artifact refs, not blobs) because the run row is
 * Electric-synced to web + desktop.
 *
 * This is a pure module — deterministic, no DB, no side effects.
 */

/** A reference to an artifact produced by an agent node. */
export interface ContextArtifactRef {
	/** Artifact kind (matches `artifactKindValues`). */
	kind: string;
	/** Stable reference to the artifact (id / path / url). */
	ref: string;
}

/** One agent node's contribution to the accumulating transcript. */
export interface ContextEntry {
	/** The pipeline graph node id (RoxBlockState id) that produced this entry. */
	nodeId: string;
	/** Role skill slug, e.g. "critic". */
	role: string;
	/** Agent id, e.g. ROX_AGENT_ID | "claude". */
	agentId: string;
	/** The agent's output text. */
	message: string;
	/** Optional artifact references produced by the node. */
	artifacts?: ContextArtifactRef[];
	/** ISO-8601 timestamp the entry was appended. */
	at: string;
}

/** The full accumulating context threaded through a pipeline run. */
export interface AccumulatedContext {
	/** The originating user/system message that seeded the pipeline. */
	seedMessage: string;
	/** Append-only transcript; later nodes see all prior entries. */
	entries: ContextEntry[];
}

/** Create an empty accumulating context seeded with the originating message. */
export function createAccumulatedContext(
	seedMessage: string,
): AccumulatedContext {
	return { seedMessage, entries: [] };
}

/**
 * Deterministically render the seed message + transcript for injection into an
 * agent's prompt. Stable formatting so runs are reproducible.
 */
export function renderContextForPrompt(ctx: AccumulatedContext): string {
	const lines: string[] = [`# Seed\n${ctx.seedMessage}`];
	if (ctx.entries.length > 0) {
		lines.push("\n# Transcript");
		for (const entry of ctx.entries) {
			lines.push(`\n## ${entry.role} (${entry.agentId})\n${entry.message}`);
		}
	}
	return lines.join("\n");
}

/**
 * Append an entry, returning a NEW context (immutable update). The executor
 * threads the updated context to downstream nodes.
 */
export function appendContextEntry(
	ctx: AccumulatedContext,
	entry: ContextEntry,
): AccumulatedContext {
	return { seedMessage: ctx.seedMessage, entries: [...ctx.entries, entry] };
}
