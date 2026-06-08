/**
 * Deterministic completeness scoring for an {@link ExecutionMonadSpec}: which of
 * the four monad facets (runtime binding / output contract / validators /
 * events) are populated. Used by the UI + tRPC to show how "ready" a transition
 * is without executing anything.
 */

import type { ExecutionMonadSpec } from "./types";

export interface MonadCompletenessBreakdown {
	runtimeBinding: boolean;
	outputContract: boolean;
	validators: boolean;
	events: boolean;
}

export interface MonadCompleteness {
	/** Fraction of facets populated, 0..1. */
	score: number;
	/** Count of populated facets. */
	populated: number;
	/** Total number of facets considered (always 4). */
	total: number;
	breakdown: MonadCompletenessBreakdown;
}

/** Compute the completeness of a single execution monad. Pure + deterministic. */
export function computeMonadCompleteness(
	monad: ExecutionMonadSpec,
): MonadCompleteness {
	const breakdown: MonadCompletenessBreakdown = {
		runtimeBinding: monad.runtimeBinding != null,
		outputContract: monad.outputContract != null,
		validators: (monad.validators?.length ?? 0) > 0,
		events: (monad.events?.length ?? 0) > 0,
	};

	const total = 4;
	const populated = Object.values(breakdown).filter(Boolean).length;
	return { score: populated / total, populated, total, breakdown };
}
