import { FEATURE_FLAGS } from "@rox/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { shouldRenderNetworkFilter } from "./network-filter.utils";

/**
 * Network Filter / Managed DNS settings shell (WS-N / N7).
 *
 * Flag-gated behind `FEATURE_FLAGS.NETWORK_FILTER`. Renders an empty
 * "coming soon" shell for users in the rollout cohort (or with an admin
 * override) and `null` for everyone else — the same shape as the cloud
 * settings gate (`cloud/page.tsx`) and the `useCommandWatcher` flag check.
 *
 * The actual NextDNS managed-profile wiring lands in a separate workstream
 * (`plans/2026-06-18-managed-nextdns-profile.md`); this delivers only the
 * gated surface so it can be toggled per-user.
 */
export function NetworkFilterSettings() {
	const flagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.NETWORK_FILTER);

	if (!shouldRenderNetworkFilter(flagEnabled)) return null;

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Сетевой фильтр</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Управляемый DNS-профиль для блокировки трекеров и нежелательных
					доменов.
				</p>
			</div>

			<div className="rounded-lg border border-border bg-card p-6">
				<h3 className="text-base font-medium">Управляемый DNS</h3>
				<p className="mt-1 text-sm text-muted-foreground select-text cursor-text">
					Скоро. Здесь появится настройка управляемого DNS-профиля (NextDNS).
				</p>
			</div>
		</div>
	);
}
