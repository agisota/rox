"use client";

import { useReducedMotion } from "motion/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/** The three motion tiers a user (or app) can select. */
export type MotionTier = "off" | "essential" | "full";

/** What kinds of motion are allowed under the active tier. */
export interface MotionCapabilities {
	/** Transform-only entrances (fade / lift). Off only in the `off` tier. */
	entrance: boolean;
	/** Idle / infinite loops (pulse, marquee, ambient). Only in `full`. */
	loop: boolean;
	/** State-change transitions (layout, value morphs). Off only in `off`. */
	transition: boolean;
}

export interface MotionFrameContextValue {
	/** Tier the user chose, before clamping for reduced-motion. */
	tier: MotionTier;
	setTier: (tier: MotionTier) => void;
	/** Tier after clamping for the OS `prefers-reduced-motion` setting. */
	effectiveTier: MotionTier;
	prefersReducedMotion: boolean;
	/** Capability flags derived from `effectiveTier`. */
	capabilities: MotionCapabilities;
}

export const CAPABILITIES: Record<MotionTier, MotionCapabilities> = {
	off: { entrance: false, loop: false, transition: false },
	essential: { entrance: true, loop: false, transition: true },
	full: { entrance: true, loop: true, transition: true },
};

export const MotionFrameContext = createContext<MotionFrameContextValue | null>(
	null,
);

/**
 * Honor `prefers-reduced-motion`: suppress all non-essential motion by clamping
 * the chosen tier to `off`. Content still renders (clock-safe), it just stops
 * animating.
 */
export function clampTier(
	tier: MotionTier,
	prefersReduced: boolean,
): MotionTier {
	return prefersReduced ? "off" : tier;
}

function isMotionTier(value: unknown): value is MotionTier {
	return value === "off" || value === "essential" || value === "full";
}

export interface MotionFrameProviderProps {
	children: ReactNode;
	/** Tier used before any persisted choice is hydrated. Defaults to `full`. */
	defaultTier?: MotionTier;
	/** localStorage key for the persisted tier. */
	storageKey?: string;
	/** Persist the tier across reloads. Defaults to `true`. */
	persist?: boolean;
}

/**
 * The single governor for all Motion Frame animation. Every primitive reads
 * its capability flags via `useMotionTier`, so motion is consistent and
 * accessible: one provider gates entrances, loops and transitions, and always
 * respects the OS `prefers-reduced-motion` setting.
 */
export function MotionFrameProvider({
	children,
	defaultTier = "full",
	storageKey = "rox-motion-tier",
	persist = true,
}: MotionFrameProviderProps) {
	const [tier, setTierState] = useState<MotionTier>(defaultTier);
	const prefersReducedMotion = useReducedMotion() ?? false;
	const hasHydrated = useRef(false);

	// Hydrate the persisted tier once on mount. `localStorage` can throw in
	// private-browsing / restricted contexts, so guard it — a storage failure
	// must never break rendering.
	useEffect(() => {
		if (!persist || typeof window === "undefined" || hasHydrated.current) {
			return;
		}
		hasHydrated.current = true;
		try {
			const stored = window.localStorage.getItem(storageKey);
			if (isMotionTier(stored)) {
				setTierState(stored);
			}
		} catch {
			// Storage unavailable — keep the default tier.
		}
	}, [persist, storageKey]);

	const setTier = useCallback(
		(next: MotionTier) => {
			setTierState(next);
			if (persist && typeof window !== "undefined") {
				try {
					window.localStorage.setItem(storageKey, next);
				} catch {
					// Storage unavailable — selection still applies this session.
				}
			}
		},
		[persist, storageKey],
	);

	const value = useMemo<MotionFrameContextValue>(() => {
		const effectiveTier = clampTier(tier, prefersReducedMotion);
		return {
			tier,
			setTier,
			effectiveTier,
			prefersReducedMotion,
			capabilities: CAPABILITIES[effectiveTier],
		};
	}, [tier, setTier, prefersReducedMotion]);

	return (
		<MotionFrameContext.Provider value={value}>
			{children}
		</MotionFrameContext.Provider>
	);
}
