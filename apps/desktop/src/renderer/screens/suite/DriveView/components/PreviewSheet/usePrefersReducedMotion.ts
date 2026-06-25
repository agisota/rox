import { useEffect, useState } from "react";

/**
 * Track the user's `prefers-reduced-motion` setting reactively. Used to disable
 * zoom/pan animations in the preview renderers so the surface honours the OS
 * accessibility preference. Local to the preview surface — no shared hook
 * exists in the renderer yet and the logic is single-use here.
 */
export function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(() => {
		if (typeof window === "undefined" || !window.matchMedia) return false;
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onChange = () => setReduced(mq.matches);
		onChange();
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	return reduced;
}
