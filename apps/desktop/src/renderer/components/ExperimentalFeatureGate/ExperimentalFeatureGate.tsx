import type {
	ExperimentalFeatureId,
	ExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import type { ReactNode } from "react";
import { useExperimentalFeature } from "renderer/hooks/useExperimentalFeature";

interface ExperimentalFeatureGateProps {
	children: ReactNode;
	fallback?: ReactNode | ((state: ExperimentalFeatureState) => ReactNode);
	featureId: ExperimentalFeatureId;
}

export function ExperimentalFeatureGate({
	children,
	fallback = null,
	featureId,
}: ExperimentalFeatureGateProps) {
	const { state } = useExperimentalFeature(featureId);
	const isUsable = state.enabled && state.availability === "available";

	if (!isUsable) {
		return typeof fallback === "function" ? fallback(state) : fallback;
	}

	return children;
}
