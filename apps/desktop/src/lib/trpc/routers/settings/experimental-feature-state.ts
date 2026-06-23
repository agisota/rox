import { experimentalFeatureOverrides } from "@rox/local-db";
import {
	EXPERIMENTAL_FEATURES,
	type ExperimentalFeatureDependencyStatus,
	type ExperimentalFeatureId,
	type ExperimentalFeatureState,
	resolveExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import { localDb } from "main/lib/local-db";

/**
 * Single source of truth for resolving experimental-feature state in the main
 * process. Shared by the settings router (which exposes the full list to the
 * renderer) and any main-process consumer that has to gate native behaviour on
 * a feature being enabled + usable (e.g. the push-to-talk global shortcut).
 *
 * Provider dependencies are derived from the presence of their env keys; the
 * desktop runtime is always present in the main process. Per-feature user
 * overrides live in the `experimental_feature_overrides` table.
 */
const EXPERIMENTAL_PROVIDER_ENV_KEYS = {
	"agent-native": [["AGENT_NATIVE_API_KEY", "AGENT_NATIVE_URL"]],
	"agent-native-templates": [
		["AGENT_NATIVE_TEMPLATES_URL", "AGENT_NATIVE_TEMPLATES_TOKEN"],
	],
	github: [["GITHUB_TOKEN"], ["GH_TOKEN"]],
	huly: [["HULY_API_TOKEN", "HULY_URL"]],
	liveblocks: [["LIVEBLOCKS_SECRET_KEY", "NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY"]],
	livekit: [
		["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "NEXT_PUBLIC_LIVEKIT_URL"],
	],
} as const;

function hasConfiguredEnvKeyGroup(groups: readonly (readonly string[])[]) {
	return groups.some((group) =>
		group.every((key) => Boolean(process.env[key]?.trim())),
	);
}

export function readExperimentalDependencyStates(): Record<
	string,
	ExperimentalFeatureDependencyStatus
> {
	return {
		"desktop-runtime": "configured",
		...Object.fromEntries(
			Object.entries(EXPERIMENTAL_PROVIDER_ENV_KEYS).map(([id, groups]) => [
				id,
				hasConfiguredEnvKeyGroup(groups) ? "configured" : "missing",
			]),
		),
	};
}

export function readExperimentalFeatureOverrides(): Record<string, boolean> {
	const rows = localDb.select().from(experimentalFeatureOverrides).all();
	return Object.fromEntries(rows.map((row) => [row.featureId, row.enabled]));
}

export function resolveExperimentalFeatureStates(): ExperimentalFeatureState[] {
	const dependencies = readExperimentalDependencyStates();
	const overrides = readExperimentalFeatureOverrides();
	return EXPERIMENTAL_FEATURES.map((feature) =>
		resolveExperimentalFeatureState(feature, {
			dependencies,
			overrides,
		}),
	);
}

/** Resolve a single feature's live state from the same sources as the list. */
export function resolveExperimentalFeatureStateById(
	featureId: ExperimentalFeatureId,
): ExperimentalFeatureState {
	return resolveExperimentalFeatureState(featureId, {
		dependencies: readExperimentalDependencyStates(),
		overrides: readExperimentalFeatureOverrides(),
	});
}

/**
 * True only when the feature is both enabled and fully usable (`available`) —
 * the same predicate the renderer's `ExperimentalFeatureGate` applies. Native
 * surfaces (global shortcuts, etc.) must use this so they stay inert while the
 * feature is planned, blocked, or missing a required provider.
 */
export function isExperimentalFeatureUsable(
	featureId: ExperimentalFeatureId,
): boolean {
	const state = resolveExperimentalFeatureStateById(featureId);
	return state.enabled && state.availability === "available";
}
