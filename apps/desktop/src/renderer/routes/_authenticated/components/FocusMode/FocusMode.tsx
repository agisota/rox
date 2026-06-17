import { pickNext, QUOTES, type Quote } from "@rox/shared/appearance";
import { QuoteScreen } from "@rox/ui/quote-screen";
import { useEffect, useState } from "react";
import { useFocusModeStore } from "renderer/stores/focus-mode";
import { useCurrentWallpaper } from "renderer/stores/wallpaper";

/** Interval between quote crossfades while focus mode is open (ms). */
const FOCUS_ROTATE_MS = 12000;

/** Pick a fresh quote, never repeating `currentId`. Falls back to the first. */
function nextQuote(currentId: string | null): Quote {
	return pickNext(QUOTES, currentId) ?? QUOTES[0];
}

/**
 * Full-screen focus mode (custom-loading-screens epic).
 *
 * A distraction-free quote experience opened from the command palette. Quotes
 * auto-rotate every {@link FOCUS_ROTATE_MS}; the overlay is dismissed with Esc
 * or a click. Renders nothing while closed. Unlike {@link QuoteLoader} this is
 * user-invoked, so it is intentionally not gated on `quoteLoaderEnabled`.
 */
export function FocusMode() {
	const isOpen = useFocusModeStore((s) => s.isOpen);
	const close = useFocusModeStore((s) => s.close);
	const wallpaper = useCurrentWallpaper();
	const [quote, setQuote] = useState<Quote>(() => nextQuote(null));

	// Fresh quote each time focus mode opens, then rotate on an interval.
	useEffect(() => {
		if (!isOpen) return;
		setQuote((current) => nextQuote(current.id));
		const rotateId = setInterval(() => {
			setQuote((current) => nextQuote(current.id));
		}, FOCUS_ROTATE_MS);
		return () => clearInterval(rotateId);
	}, [isOpen]);

	// Dismiss on Escape while open.
	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, close]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[60]">
			<QuoteScreen quote={quote} wallpaper={wallpaper} />
			{/* z-[60] keeps the dismiss overlay above QuoteScreen's own z-50 so
			    clicks anywhere close focus mode. */}
			<button
				type="button"
				aria-label="Закрыть режим фокуса"
				className="absolute inset-0 z-[60] cursor-default bg-transparent"
				onClick={close}
			/>
		</div>
	);
}
