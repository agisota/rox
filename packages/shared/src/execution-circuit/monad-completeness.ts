import type { MonadCompleteness, TransitionSpec } from "./types";

/**
 * Heuristic readiness score (0..100) for a transition's execution monad — how
 * fully its context/tools/constraints/output/validators are specified. This is
 * NOT a security score; it tells the UI how "ready to run" a transition is and
 * which dimensions are still missing.
 */
export function computeMonadCompleteness(
	transition: TransitionSpec,
): MonadCompleteness {
	const monad = transition.monad;
	const runtime = transition.runtime;

	const dimensions: Array<{ label: string; present: boolean }> = [
		{
			label: "Runtime selected",
			present: !!runtime && runtime.kind !== "unspecified",
		},
		{
			label: "Agent (or runtime notes explaining why not)",
			present: !!runtime?.agent || !!runtime?.notes,
		},
		{
			label: "Context references",
			present: (monad?.contextRefs ?? []).length > 0,
		},
		{ label: "Tools", present: (monad?.tools ?? []).length > 0 },
		{ label: "Constraints", present: (monad?.constraints ?? []).length > 0 },
		{
			label: "Quality criteria",
			present: (monad?.qualityCriteria ?? []).length > 0,
		},
		{
			label: "Output contract",
			present: (transition.outputContract?.requiredFields ?? []).length > 0,
		},
		{ label: "Validator", present: (transition.validators ?? []).length > 0 },
		{
			label: "At least one required event",
			present: (transition.requiredEvents ?? []).length > 0,
		},
	];

	const present = dimensions.filter((d) => d.present).map((d) => d.label);
	const missing = dimensions.filter((d) => !d.present).map((d) => d.label);
	const score = Math.round((present.length / dimensions.length) * 100);

	return { score, present, missing };
}
