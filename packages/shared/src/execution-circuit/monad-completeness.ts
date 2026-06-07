import type { TransitionSpec } from "./schemas";

export type MonadCompleteness = {
	score: number;
	missing: string[];
	present: string[];
};

type CompletenessDimension = {
	label: string;
	present: boolean;
};

function hasText(value: string | undefined): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function hasItems(values: string[] | undefined): boolean {
	return (
		Array.isArray(values) && values.some((value) => value.trim().length > 0)
	);
}

export function computeMonadCompleteness(
	transition: TransitionSpec,
): MonadCompleteness {
	const dimensions: CompletenessDimension[] = [
		{
			label: "Runtime selected",
			present: transition.runtime.kind !== "unspecified",
		},
		{
			label: "Agent selected or explained",
			present:
				hasText(transition.runtime.agent) || hasText(transition.runtime.notes),
		},
		{
			label: "Context references",
			present: hasItems(transition.monad.contextRefs),
		},
		{
			label: "Tools",
			present: hasItems(transition.monad.tools),
		},
		{
			label: "Constraints",
			present: hasItems(transition.monad.constraints),
		},
		{
			label: "Quality criteria",
			present: hasItems(transition.monad.qualityCriteria),
		},
		{
			label: "Output contract",
			present: transition.outputContract.requiredFields.length > 0,
		},
		{
			label: "Validator",
			present: transition.validators.length > 0,
		},
		{
			label: "Required event",
			present: transition.requiredEvents.length > 0,
		},
	];

	const present = dimensions
		.filter((dimension) => dimension.present)
		.map((dimension) => dimension.label);
	const missing = dimensions
		.filter((dimension) => !dimension.present)
		.map((dimension) => dimension.label);

	return {
		score: Math.round((present.length / dimensions.length) * 100),
		present,
		missing,
	};
}
