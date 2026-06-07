import { useReducedMotion } from "framer-motion";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type MotionPreference = "full" | "essential" | "off";

interface MotionPreferenceStore {
	preference: MotionPreference;
	setPreference: (preference: MotionPreference) => void;
}

/**
 * Persisted user motion preference. Wired into Settings in PR-13; usable
 * standalone before then. Lives in its own namespace so it never collides with
 * the app's theme/appearance stores.
 */
export const useMotionPreferenceStore = create<MotionPreferenceStore>()(
	devtools(
		persist(
			(set) => ({
				preference: "full",
				setPreference: (preference) => set({ preference }),
			}),
			{ name: "monad-motion-preference" },
		),
		{ name: "MonadMotionPreference" },
	),
);

export interface ResolvedMotion {
	/** The user's stored preference. */
	preference: MotionPreference;
	/** OS-level `prefers-reduced-motion`. */
	systemReduced: boolean;
	/** Effective level after folding in the OS preference. */
	level: MotionPreference;
	/** Suppress decorative / non-essential motion (essential *or* off). */
	reduced: boolean;
	/** Suppress all motion — render the resting state immediately (off). */
	disabled: boolean;
	setPreference: (preference: MotionPreference) => void;
}

/**
 * Pure resolution of stored preference + OS setting into an effective level.
 *
 *  - `full` is downgraded to `essential` when the OS asks for reduced motion.
 *  - an explicit `off` is always honoured (even without an OS preference).
 *  - `essential` is never upgraded.
 */
export function resolveMotion(
	preference: MotionPreference,
	systemReduced: boolean,
): MotionPreference {
	if (preference === "off") return "off";
	if (systemReduced) return "essential";
	return preference;
}

/**
 * The single hook every MONAD component consults before animating.
 *
 *  - `reduced` → drop decorative motion (staggers, hero drifts, loops); keep
 *    meaningful state-signal micro-motion.
 *  - `disabled` → no motion at all; jump straight to the resting state, which
 *    is always fully visible.
 */
export function useMotionPreference(): ResolvedMotion {
	const systemReduced = useReducedMotion() ?? false;
	const preference = useMotionPreferenceStore((s) => s.preference);
	const setPreference = useMotionPreferenceStore((s) => s.setPreference);

	const level = resolveMotion(preference, systemReduced);

	return {
		preference,
		systemReduced,
		level,
		reduced: level !== "full",
		disabled: level === "off",
		setPreference,
	};
}
