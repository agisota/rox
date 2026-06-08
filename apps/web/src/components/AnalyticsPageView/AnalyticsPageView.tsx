"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { trackPageView } from "@/lib/analytics";

/**
 * Mirrors client-side navigations into OpenPanel as `screen_view` events
 * (openpanel epic), capturing UTM params + referrer on each view. PostHog
 * already captures page views on its own, so this only covers OpenPanel.
 */
export function AnalyticsPageView() {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	useEffect(() => {
		if (!pathname) return;
		const query = searchParams?.toString();
		trackPageView(query ? `${pathname}?${query}` : pathname);
	}, [pathname, searchParams]);

	return null;
}
