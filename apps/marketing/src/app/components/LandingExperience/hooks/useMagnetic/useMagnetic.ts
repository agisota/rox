"use client";

import { createAnimatable, utils } from "animejs";
import { useEffect, useRef } from "react";

/**
 * Minimal structural view of the anime.js v4 `createAnimatable` return value.
 * `AnimatableObject` exposes per-property setters through a loose
 * `Record<string, AnimatableProperty>` index signature, so we pin the exact
 * shape we use here to keep call sites type-safe without `any`.
 */
interface MagneticAnimatable {
	x: (value: number) => void;
	y: (value: number) => void;
	revert: () => void;
}

interface UseMagneticOptions {
	/** Fraction of the cursor offset applied to the element (0–1). */
	strength?: number;
	/** Maximum travel from rest, in pixels. */
	max?: number;
}

/**
 * Subtle "magnetic" pointer-follow effect: the element eases a few pixels
 * toward the cursor on `pointermove` and springs back on `pointerleave`.
 *
 * Honors `prefers-reduced-motion` (no-op when the user opts out) and is
 * StrictMode-safe — listeners and the animatable are reverted on cleanup.
 */
export function useMagnetic<T extends HTMLElement>({
	strength = 0.2,
	max = 12,
}: UseMagneticOptions = {}) {
	const ref = useRef<T>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const animatable = createAnimatable(el, {
			x: { duration: 380, ease: "out(3)" },
			y: { duration: 380, ease: "out(3)" },
		}) as unknown as MagneticAnimatable;

		const handlePointerMove = (event: PointerEvent) => {
			const rect = el.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const dx = utils.clamp((event.clientX - cx) * strength, -max, max);
			const dy = utils.clamp((event.clientY - cy) * strength, -max, max);
			animatable.x(dx);
			animatable.y(dy);
		};

		const handlePointerLeave = () => {
			animatable.x(0);
			animatable.y(0);
		};

		el.addEventListener("pointermove", handlePointerMove);
		el.addEventListener("pointerleave", handlePointerLeave);

		return () => {
			el.removeEventListener("pointermove", handlePointerMove);
			el.removeEventListener("pointerleave", handlePointerLeave);
			animatable.revert();
		};
	}, [strength, max]);

	return ref;
}
