import { RevealFlash } from "@rox/ui/motion";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	settingItemAnchorId,
	useSettingsDeepLinkStore,
} from "../../utils/settings-deeplink";
import { getSettingsItem } from "../../utils/settings-search";
import { getSectionFromPath } from "../SettingsSidebar/settings-manifest";

/**
 * Command-palette deep-link arrival flash (#592).
 *
 * Mounted once inside the settings layout. When the palette records a pending
 * target (see `settings-deeplink` store) it waits until the route shows the
 * target's section, then finds the card's anchor element
 * (`#setting-item-<id>`), scrolls it into view and overlays a one-shot
 * {@link RevealFlash} on its bounding rect — the same rect-anchor technique used
 * for the file-tree reveal, so it can't reflow the settings page.
 *
 * The target is consumed (cleared) as soon as the flash starts, so it fires
 * exactly once per palette jump. If the anchor never appears (a section whose
 * cards aren't anchored yet), navigation still happened; we just clear the
 * target after a short grace window so it can't leak into a later visit.
 */
export function SettingsDeepLinkFlash() {
	const location = useLocation();
	const pendingItemId = useSettingsDeepLinkStore(
		(state) => state.pendingItemId,
	);
	const consumeDeepLink = useSettingsDeepLinkStore(
		(state) => state.consumeDeepLink,
	);
	const clearDeepLink = useSettingsDeepLinkStore(
		(state) => state.clearDeepLink,
	);
	const [rect, setRect] = useState<DOMRect | null>(null);

	useEffect(() => {
		if (!pendingItemId) return;

		const item = getSettingsItem(pendingItemId);
		if (!item) {
			clearDeepLink();
			return;
		}

		// Only act once we're on the target's section route, so the anchor is
		// actually mounted before we look for it.
		const currentSection = getSectionFromPath(location.pathname);
		if (currentSection !== item.section) return;

		let frame = 0;
		let attempts = 0;
		const maxAttempts = 30; // ~0.5s at 60fps: cover late-mounting cards.

		const tryFlash = () => {
			const el = document.getElementById(settingItemAnchorId(pendingItemId));
			if (el) {
				el.scrollIntoView({ block: "center", behavior: "smooth" });
				// Consume only when we found the anchor; if it matched, flash its rect.
				if (consumeDeepLink(pendingItemId)) {
					setRect(el.getBoundingClientRect());
				}
				return;
			}
			attempts += 1;
			if (attempts >= maxAttempts) {
				clearDeepLink();
				return;
			}
			frame = requestAnimationFrame(tryFlash);
		};

		frame = requestAnimationFrame(tryFlash);
		return () => cancelAnimationFrame(frame);
	}, [pendingItemId, location.pathname, consumeDeepLink, clearDeepLink]);

	return <RevealFlash rect={rect} onDone={() => setRect(null)} />;
}
