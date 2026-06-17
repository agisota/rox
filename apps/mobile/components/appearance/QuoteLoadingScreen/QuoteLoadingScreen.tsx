import { getWallpaper, pickNext, QUOTES } from "@rox/shared/appearance";
import { useMemo } from "react";
import { QuoteScreen } from "@/components/appearance/QuoteScreen";
import { useAppearance } from "@/screens/RootLayout/providers/AppearanceProvider";

/**
 * Loading overlay that shows a motivational {@link QuoteScreen} instead of a
 * spinner, gated on the `quoteLoaderEnabled` appearance setting.
 *
 * Picks one quote per mount (no flicker mid-load) over the currently selected
 * wallpaper. When the quote loader is disabled, renders `null` so callers can
 * fall back to their own loading UI.
 */
export function QuoteLoadingScreen() {
	const { isHydrated, settings } = useAppearance();

	// Stable per-mount quote: re-picking on every render would flicker the text.
	const quote = useMemo(() => pickNext(QUOTES, null) ?? QUOTES[0], []);
	const wallpaper = getWallpaper(settings.wallpaperId) ?? null;

	if (!isHydrated || !settings.quoteLoaderEnabled || !quote) return null;

	return <QuoteScreen quote={quote} wallpaper={wallpaper} />;
}
