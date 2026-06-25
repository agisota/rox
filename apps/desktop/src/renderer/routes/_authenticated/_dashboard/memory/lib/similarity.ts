import type { SelectMemoryItem } from "@rox/db/schema";

/**
 * Client-side, embedding-free near-duplicate detection for memory items.
 *
 * This is the resident-data stand-in for the deferred Phase-6 pgvector
 * deduplication: instead of cosine over embeddings, it uses a character-trigram
 * Dice coefficient (Sørensen–Dice), which is cheap, deterministic, and runs over
 * the Electric collection with zero network. Two memories that say almost the
 * same thing in slightly different words score high; unrelated ones score low.
 *
 * Pure + dependency-free so it ports to web/mobile unchanged and is unit-tested
 * in isolation.
 */

/** Minimum Dice similarity (0..1) for two items to be considered near-duplicates. */
export const SIMILARITY_THRESHOLD = 0.6;

/** Normalize a body for comparison: lowercase, collapse whitespace, trim. */
function normalize(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Character trigrams of a normalized string. Strings shorter than 3 chars yield
 * the whole string as a single gram so very short bodies still compare.
 */
function trigrams(text: string): Set<string> {
	const normalized = normalize(text);
	const grams = new Set<string>();
	if (normalized.length < 3) {
		if (normalized.length > 0) grams.add(normalized);
		return grams;
	}
	for (let i = 0; i <= normalized.length - 3; i++) {
		grams.add(normalized.slice(i, i + 3));
	}
	return grams;
}

/**
 * Sørensen–Dice coefficient over character trigrams: `2·|A∩B| / (|A|+|B|)`.
 * Returns 1 for identical normalized text, 0 for no shared trigrams.
 */
export function similarity(a: string, b: string): number {
	const na = normalize(a);
	const nb = normalize(b);
	if (na === nb) return na.length === 0 ? 0 : 1;
	const ga = trigrams(a);
	const gb = trigrams(b);
	if (ga.size === 0 || gb.size === 0) return 0;
	let intersection = 0;
	for (const gram of ga) {
		if (gb.has(gram)) intersection += 1;
	}
	return (2 * intersection) / (ga.size + gb.size);
}

/** A cluster of near-duplicate memory items (always ≥2 members). */
export interface SimilarityCluster {
	/** The seed item the cluster is keyed on. */
	seed: SelectMemoryItem;
	/** All cluster members including the seed, most-recent-first. */
	members: SelectMemoryItem[];
}

/**
 * Find the near-duplicate cluster containing `seed` among `candidates`: every
 * item whose Dice similarity to the seed is at or above `threshold`. Returns
 * `null` when fewer than two items qualify (the passive affordance only appears
 * for genuine duplicates). Members are sorted most-recent-first so the merge UI
 * defaults to keeping the freshest wording.
 */
export function findSimilarCluster(
	seed: SelectMemoryItem,
	candidates: readonly SelectMemoryItem[],
	threshold = SIMILARITY_THRESHOLD,
): SimilarityCluster | null {
	const members = candidates.filter(
		(candidate) =>
			candidate.id === seed.id ||
			similarity(seed.body, candidate.body) >= threshold,
	);
	if (members.length < 2) return null;
	const sorted = [...members].sort((a, b) => {
		const at = +new Date(a.updatedAt);
		const bt = +new Date(b.updatedAt);
		return bt - at;
	});
	return { seed, members: sorted };
}
