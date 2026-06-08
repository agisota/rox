"use client";

import { useReducedMotion } from "motion/react";

/**
 * Whether motion is allowed for the current user. Wraps Motion's
 * `useReducedMotion` so every Motion Frame primitive shares one gate: when this
 * returns `false`, primitives render their final state instantly.
 *
 * Named deliberately (not `useReducedMotion`) so the call site reads as intent
 * — "should I animate?" — and does not shadow Motion's own hook.
 */
export function useShouldAnimate(): boolean {
	const prefersReducedMotion = useReducedMotion();
	return !prefersReducedMotion;
}
