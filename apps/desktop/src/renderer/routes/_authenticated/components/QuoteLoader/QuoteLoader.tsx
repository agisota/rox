import { pickNext, QUOTES, type Quote } from "@rox/shared/appearance";
import { QuoteScreen } from "@rox/ui/quote-screen";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCurrentWallpaper } from "renderer/stores/wallpaper";

/** Sustained-pending delay before the quote screen appears (ms). */
const SHOW_DELAY_MS = 350;
/** Interval between quote crossfades while the screen stays visible (ms). */
const QUOTE_ROTATE_MS = 8000;

/** Pick a fresh quote, never repeating `currentId`. Falls back to the first. */
function nextQuote(currentId: string | null): Quote {
	return pickNext(QUOTES, currentId) ?? QUOTES[0];
}

/**
 * Quote loading screen for long route transitions (custom-loading-screens
 * epic). Replaces plain spinners during sustained navigation waits.
 *
 * Visibility is debounced, not the render: the screen only appears after
 * {@link SHOW_DELAY_MS} of continuous pending state, so fast navigations never
 * flash it; slow ones (router "hangs" several seconds) do show it. While
 * visible it rotates quotes every {@link QUOTE_ROTATE_MS}. Everything is gated
 * on the persisted `quoteLoaderEnabled` appearance setting.
 */
export function QuoteLoader() {
	const { data: appearance, isPending: isAppearancePending } =
		electronTrpc.window.getAppearance.useQuery();
	const quoteLoaderEnabled =
		!isAppearancePending && (appearance?.quoteLoaderEnabled ?? false);

	const status = useRouterState({ select: (s) => s.status });
	const isPending = status === "pending";

	const wallpaper = useCurrentWallpaper();
	const [showQuote, setShowQuote] = useState(false);
	const [quote, setQuote] = useState<Quote>(() => nextQuote(null));
	const quoteRef = useRef(quote);
	quoteRef.current = quote;

	// Debounce visibility: only show after sustained pending, hide immediately
	// once navigation settles. Pick a fresh quote when the screen first appears.
	useEffect(() => {
		if (!quoteLoaderEnabled || !isPending) {
			setShowQuote(false);
			return;
		}
		const id = setTimeout(() => {
			setQuote(nextQuote(quoteRef.current.id));
			setShowQuote(true);
		}, SHOW_DELAY_MS);
		return () => clearTimeout(id);
	}, [isPending, quoteLoaderEnabled]);

	// Rotate quotes only while the screen is actually visible.
	useEffect(() => {
		if (!showQuote) return;
		const id = setInterval(() => {
			setQuote((current) => nextQuote(current.id));
		}, QUOTE_ROTATE_MS);
		return () => clearInterval(id);
	}, [showQuote]);

	if (!showQuote) return null;

	return <QuoteScreen quote={quote} wallpaper={wallpaper} />;
}
