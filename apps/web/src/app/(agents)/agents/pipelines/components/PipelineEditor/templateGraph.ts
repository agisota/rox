/**
 * Pure helpers for the in-editor templates gallery: insert a template/subgraph
 * into the *current* canvas (id-remap + position offset, never colliding with
 * existing blocks) and serialise the current graph back into a
 * {@link PipelineTemplate}-compatible object ("Save as template").
 *
 * Framework-free (only the `@rox/workflow-core` value types) so the merge and
 * round-trip logic is unit-tested without rendering. Shared by desktop + web.
 */

import {
	arePortTypesCompatible,
	getNodeType,
	type RoxEdge,
	type RoxWorkflowState,
} from "@rox/workflow-core";
import type { PipelineTemplate } from "../templates";

/** Horizontal shift applied to an inserted subgraph so it lands clear of the
 * existing graph (to the right of its bounding box). */
const INSERT_GAP_X = 320;

/**
 * Default out-port type of a block (the `out` handle, else the first output),
 * or `"any"` when the type is unknown/untyped. Used to decide whether a
 * re-anchor edge needs a bridging adapter (see {@link insertTemplate}).
 */
function defaultOutType(blockType: string | undefined): string {
	const def = blockType ? getNodeType(blockType) : undefined;
	if (!def) return "any";
	const port = def.outputs.find((p) => p.name === "out") ?? def.outputs[0];
	return port?.type ?? "any";
}

/**
 * Default in-port type of a block (the `in` handle, else the first input),
 * or `"any"` when the type is unknown/untyped.
 */
function defaultInType(blockType: string | undefined): string {
	const def = blockType ? getNodeType(blockType) : undefined;
	if (!def) return "any";
	const port = def.inputs.find((p) => p.name === "in") ?? def.inputs[0];
	return port?.type ?? "any";
}

/** A canvas is "empty" (replace, don't insert) when it has only the start node. */
export function isEmptyCanvas(state: RoxWorkflowState): boolean {
	return Object.keys(state.blocks).length <= 1;
}

/** Right edge of the current graph's bounding box (0 when no positioned block). */
function rightEdgeOf(state: RoxWorkflowState): number {
	let maxX = 0;
	let seen = false;
	for (const block of Object.values(state.blocks)) {
		const x = block.position?.x;
		if (typeof x === "number") {
			maxX = seen ? Math.max(maxX, x) : x;
			seen = true;
		}
	}
	return seen ? maxX : 0;
}

/** Smallest x among a template's blocks (its left edge), for offset normalising. */
function leftEdgeOf(state: RoxWorkflowState): number {
	let minX = 0;
	let seen = false;
	for (const block of Object.values(state.blocks)) {
		const x = block.position?.x;
		if (typeof x === "number") {
			minX = seen ? Math.min(minX, x) : x;
			seen = true;
		}
	}
	return seen ? minX : 0;
}

/**
 * Produce a fresh, collision-free block id derived from `base` (the template's
 * own id, kept readable) that is absent from `taken`. Mutates `taken` to claim
 * the chosen id so a single remap pass stays internally unique too.
 */
function freshId(base: string, taken: Set<string>): string {
	if (!taken.has(base)) {
		taken.add(base);
		return base;
	}
	let n = 2;
	let candidate = `${base}_${n}`;
	while (taken.has(candidate)) {
		n += 1;
		candidate = `${base}_${n}`;
	}
	taken.add(candidate);
	return candidate;
}

/** Result of an insert: the merged graph + the ids of the inserted blocks. */
export type InsertResult = {
	state: RoxWorkflowState;
	/** Remapped ids of the inserted (non-start) template blocks. */
	insertedIds: string[];
};

/**
 * Merge a template graph into the current graph as a subgraph.
 *
 * Invariants preserved (so the result still passes `validateGraph`):
 * - Exactly one `start`: the template's own start block is DROPPED; the blocks
 *   the template's start fed into are re-anchored onto `anchorId` (the current
 *   graph's reachable frontier) so they stay reachable.
 * - No id collisions: every template block id is remapped against the union of
 *   existing ids and already-claimed inserted ids.
 * - No position overlap: inserted blocks are shifted right of the current
 *   graph's bounding box (preserving their relative layout).
 *
 * When the current canvas is empty (start only), the template REPLACES it
 * wholesale (see {@link applyTemplate}); this function is the non-empty path.
 *
 * @param prev current graph (non-empty)
 * @param template the template graph to insert
 * @param anchorId existing block to wire the template's entry blocks onto, or
 *   null to leave them unwired (caller decides — typically the reachable tail)
 */
export function insertTemplate(
	prev: RoxWorkflowState,
	template: RoxWorkflowState,
	anchorId: string | null,
): InsertResult {
	const taken = new Set(Object.keys(prev.blocks));

	// Identify the template's start block(s) — they are dropped on insert (the
	// merged graph keeps the current graph's single start).
	const templateStartIds = new Set(
		Object.entries(template.blocks)
			.filter(([, block]) => block.type === "start")
			.map(([id]) => id),
	);

	// Remap every NON-start template id to a fresh, collision-free id.
	const idMap = new Map<string, string>();
	for (const id of Object.keys(template.blocks)) {
		if (templateStartIds.has(id)) continue;
		idMap.set(id, freshId(id, taken));
	}

	// Offset so the subgraph lands to the right of the current graph, keeping its
	// own relative layout (shift = currentRight + gap - templateLeft).
	const shiftX = rightEdgeOf(prev) + INSERT_GAP_X - leftEdgeOf(template);

	const mergedBlocks = { ...prev.blocks };
	for (const [oldId, block] of Object.entries(template.blocks)) {
		if (templateStartIds.has(oldId)) continue;
		const newId = idMap.get(oldId);
		if (newId === undefined) continue;
		const pos = block.position;
		mergedBlocks[newId] = {
			...block,
			position: pos ? { x: pos.x + shiftX, y: pos.y } : undefined,
		};
	}

	// Re-key edges. Edges that originated FROM the template's start become
	// anchor → entry edges (re-anchored, default handle dropped so the new source
	// uses its own default out-port). Edges between two dropped starts (none in
	// practice) are skipped. All other edges are remapped through `idMap`.
	const mergedEdges: RoxEdge[] = [...prev.edges];
	const edgeIds = new Set(
		prev.edges.map((e) => e.id).filter(Boolean) as string[],
	);
	const claimEdgeId = (base: string): string => {
		if (!edgeIds.has(base)) {
			edgeIds.add(base);
			return base;
		}
		let n = 2;
		let candidate = `${base}_${n}`;
		while (edgeIds.has(candidate)) {
			n += 1;
			candidate = `${base}_${n}`;
		}
		edgeIds.add(candidate);
		return candidate;
	};

	// Type of the anchor's default out-port — a re-anchor edge whose target
	// requires a different concrete in-type needs a bridging adapter (#549).
	const anchorOutType =
		anchorId !== null ? defaultOutType(prev.blocks[anchorId]?.type) : "any";

	for (const edge of template.edges) {
		const fromStart = templateStartIds.has(edge.source);
		const targetIsStart = templateStartIds.has(edge.target);
		if (targetIsStart) continue; // nothing wires INTO a start
		const newTarget = idMap.get(edge.target);
		if (newTarget === undefined) continue;

		if (fromStart) {
			// Re-anchor the template's entry block onto the current frontier.
			if (anchorId === null) continue;
			// The anchor is the prior graph's tail (e.g. an agent_run/model whose
			// out is `message`); the entry block may require a different concrete
			// in-type (knowledge_retrieval/embedding/classifier require `string`).
			// When the types are incompatible, splice a `transform` adapter
			// (in:any → out:any) between them so the merged graph passes the typed
			// `validateGraph` port check without weakening #549 — a real pipeline
			// would normalise the upstream payload before such a node anyway.
			const entryInType = defaultInType(template.blocks[edge.target]?.type);
			if (!arePortTypesCompatible(anchorOutType, entryInType)) {
				const bridgeId = freshId(`adapt_${edge.target}`, taken);
				const anchorPos = prev.blocks[anchorId]?.position;
				mergedBlocks[bridgeId] = {
					type: "transform",
					name: "Адаптер",
					position: anchorPos
						? { x: anchorPos.x + INSERT_GAP_X / 2, y: anchorPos.y }
						: undefined,
					subBlocks: { mode: "template", template: "{{ input }}" },
				};
				mergedEdges.push({
					id: claimEdgeId(`${anchorId}->${bridgeId}`),
					source: anchorId,
					target: bridgeId,
				});
				mergedEdges.push({
					id: claimEdgeId(`${bridgeId}->${newTarget}`),
					source: bridgeId,
					target: newTarget,
				});
				continue;
			}
			mergedEdges.push({
				id: claimEdgeId(`${anchorId}->${newTarget}`),
				source: anchorId,
				target: newTarget,
			});
			continue;
		}

		const newSource = idMap.get(edge.source);
		if (newSource === undefined) continue;
		mergedEdges.push({
			id: claimEdgeId(edge.id ?? `${newSource}->${newTarget}`),
			source: newSource,
			target: newTarget,
			sourceHandle: edge.sourceHandle,
			targetHandle: edge.targetHandle,
		});
	}

	return {
		state: {
			...prev,
			blocks: mergedBlocks,
			edges: mergedEdges,
		},
		insertedIds: [...idMap.values()],
	};
}

/**
 * Serialise the current graph into a {@link PipelineTemplate}-compatible object
 * — the "Save as template" builder (vs. hard-coding a template in
 * `templates.ts`). The returned template's `build()` returns a fresh deep copy
 * each call (so inserting it twice never shares block references), normalised to
 * the canonical `RoxWorkflowState` shape an empty graph would have.
 */
export function buildTemplateFromState(
	state: RoxWorkflowState,
	meta: {
		id: string;
		name: string;
		description: string;
		slugSeed: string;
		category?: string;
		icon?: string;
		tags?: string[];
	},
): PipelineTemplate {
	// Capture a normalised snapshot once; `build()` deep-clones it per call.
	const snapshot: RoxWorkflowState = {
		blocks: structuredClone(state.blocks),
		edges: structuredClone(state.edges),
		variables: structuredClone(state.variables ?? {}),
		loops: structuredClone(state.loops ?? {}),
		parallels: structuredClone(state.parallels ?? {}),
		metadata: { name: meta.name },
	};

	return {
		id: meta.id,
		name: meta.name,
		description: meta.description,
		slugSeed: meta.slugSeed,
		category: meta.category,
		icon: meta.icon,
		tags: meta.tags,
		build: () => structuredClone(snapshot),
	};
}
