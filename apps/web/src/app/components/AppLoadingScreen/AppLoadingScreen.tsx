"use client";

/**
 * AppLoadingScreen — the app-level Suspense/route fallback (custom-loading-
 * screens epic). Shows a motivational {@link QuoteScreen} behind the current
 * wallpaper when the quote loader is enabled, otherwise a minimal spinner.
 *
 * Rendered from `app/loading.tsx`, so Next.js mounts it whenever a route
 * segment suspends. It reads appearance state from {@link useAppearance}, which
 * is available because `loading.tsx` renders inside the provider tree.
 */

import { QUOTES, type Quote } from "@rox/shared/appearance";
import { QuoteScreen } from "@rox/ui/quote-screen";
import { useMemo } from "react";
import { useAppearance } from "@/app/providers/AppearanceProvider";

/** Pick a random quote from the curated pack, with a safe fallback. */
const FALLBACK_QUOTE: Quote = {
	id: "fallback",
	text: "Success is a decision.",
};

function pickQuote(): Quote {
	const index = Math.floor(Math.random() * QUOTES.length);
	return QUOTES[index] ?? QUOTES[0] ?? FALLBACK_QUOTE;
}

/** Route-level loading fallback: a quote screen, or a minimal spinner. */
export function AppLoadingScreen() {
	const { settings, currentWallpaper } = useAppearance();
	// Stable per-mount so the quote does not flicker on re-render.
	const quote = useMemo(() => pickQuote(), []);

	if (!settings.quoteLoaderEnabled) {
		return (
			// biome-ignore lint/a11y/useSemanticElements: role=status gives screen readers a reliable loading live region.
			<div
				aria-live="polite"
				className="flex min-h-[50vh] items-center justify-center"
				role="status"
			>
				<span className="sr-only">Загрузка</span>
				<span
					aria-hidden="true"
					className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
				/>
			</div>
		);
	}

	return <QuoteScreen quote={quote} wallpaper={currentWallpaper} />;
}
