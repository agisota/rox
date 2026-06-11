import { useEffect } from "react";
import { setOpenPanelTelemetryEnabled } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

export function TelemetrySync() {
	const { data: telemetryEnabled } =
		electronTrpc.settings.getTelemetryEnabled.useQuery();

	useEffect(() => {
		if (telemetryEnabled === undefined) return;

		// Keep the OpenPanel opt-out gate in lockstep with PostHog's.
		setOpenPanelTelemetryEnabled(telemetryEnabled);

		if (telemetryEnabled) {
			if (typeof posthog?.opt_in_capturing === "function") {
				posthog.opt_in_capturing();
			}
		} else {
			if (typeof posthog?.opt_out_capturing === "function") {
				posthog.opt_out_capturing();
			}
		}
	}, [telemetryEnabled]);

	return null;
}
