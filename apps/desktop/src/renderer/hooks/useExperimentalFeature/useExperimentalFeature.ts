import {
	type ExperimentalFeatureId,
	type ExperimentalFeatureState,
	resolveExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface UseExperimentalFeatureResult {
	state: ExperimentalFeatureState;
	isLoading: boolean;
	refetch: () => Promise<unknown>;
}

export function useExperimentalFeature(
	id: ExperimentalFeatureId,
): UseExperimentalFeatureResult {
	const query = electronTrpc.settings.experimentalFeatures.list.useQuery();

	const state = useMemo(
		() =>
			query.data?.find((featureState) => featureState.id === id) ??
			resolveExperimentalFeatureState(id),
		[id, query.data],
	);

	return {
		state,
		isLoading: query.isLoading && !query.data,
		refetch: query.refetch,
	};
}
