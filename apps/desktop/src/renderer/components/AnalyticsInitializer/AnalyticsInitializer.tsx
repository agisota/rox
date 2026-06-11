import { createAppOpenedEvent } from "@rox/analytics";
import { useEffect } from "react";
import { initAnalytics, trackEvent } from "renderer/lib/analytics";

let didTrackAppOpened = false;

export function AnalyticsInitializer() {
	useEffect(() => {
		initAnalytics();

		if (didTrackAppOpened) return;
		didTrackAppOpened = true;

		trackEvent(
			createAppOpenedEvent({
				appVersion: window.App.appVersion,
				platform: window.navigator.platform,
			}),
		);
	}, []);

	return null;
}
