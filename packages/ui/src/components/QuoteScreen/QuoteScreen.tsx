"use client";

/**
 * QuoteScreen — a full-bleed cinematic card showing a motivational quote
 * (custom-loading-screens epic). Replaces plain spinners on long waits and
 * powers the standalone "focus" mode.
 *
 * Pure and presentational: the caller decides when it is mounted (e.g. the
 * debounced route-transition gate) and which `quote` to show. Changing `quote`
 * crossfades to the new line. An optional `wallpaper` renders behind a scrim so
 * text stays legible.
 */

import type { Quote, Wallpaper } from "@rox/shared/appearance";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { WallpaperLayer } from "../WallpaperLayer";

interface QuoteScreenProps {
	quote: Quote;
	/** Optional background shown behind the scrim. */
	wallpaper?: Wallpaper | null;
	/** Extra classes on the fixed container (e.g. z-index). */
	className?: string;
}

/** Render quote text, italicizing the first verbatim `emphasis` occurrence. */
function renderQuoteText(quote: Quote): ReactNode {
	const { text, emphasis } = quote;
	if (!emphasis) return text;

	const start = text.indexOf(emphasis);
	if (start === -1) return text;

	const before = text.slice(0, start);
	const after = text.slice(start + emphasis.length);
	return (
		<>
			{before}
			<em className="text-primary italic">{emphasis}</em>
			{after}
		</>
	);
}

export function QuoteScreen({ quote, wallpaper, className }: QuoteScreenProps) {
	const reduceMotion = useReducedMotion();
	const duration = reduceMotion ? 0 : 0.6;

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-start overflow-hidden bg-background",
				className,
			)}
		>
			{wallpaper ? (
				<WallpaperLayer wallpaper={wallpaper} className="-z-10" />
			) : null}
			{/* Scrim keeps text legible over any background. */}
			<div className="absolute inset-0 -z-10 bg-gradient-to-r from-background/95 via-background/70 to-background/30" />

			<AnimatePresence mode="wait">
				<motion.blockquote
					key={quote.id}
					className="max-w-2xl px-8 sm:px-16 md:px-24"
					initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }}
					transition={{ duration }}
				>
					<p className="text-pretty font-semibold text-3xl text-foreground leading-tight tracking-tight sm:text-4xl md:text-5xl">
						{renderQuoteText(quote)}
					</p>
					{quote.author ? (
						<cite className="mt-6 block text-base text-muted-foreground not-italic">
							— {quote.author}
						</cite>
					) : null}
				</motion.blockquote>
			</AnimatePresence>
		</div>
	);
}
