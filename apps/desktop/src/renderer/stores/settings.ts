import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	/**
	 * Opacity (0..1) of the diff viewer surface background. Lower values let the
	 * glass wallpaper show through the "просмотр изменений" panes; 1 = fully solid.
	 */
	diffBackgroundOpacity: number;
	animationPreference: "full" | "essential" | "off";
}

/** How much motion the app uses. The OS "Reduce motion" setting always wins. */
export type AnimationPreference = Settings["animationPreference"];

/** Default motion level, used by the "reset to default" affordance. */
export const DEFAULT_ANIMATION_PREFERENCE: AnimationPreference = "full";

/** Clamp range for {@link Settings.diffBackgroundOpacity}. */
export const MIN_DIFF_BACKGROUND_OPACITY = 0.3;
export const MAX_DIFF_BACKGROUND_OPACITY = 1;
export const DEFAULT_DIFF_BACKGROUND_OPACITY = 0.85;

export function clampDiffBackgroundOpacity(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_DIFF_BACKGROUND_OPACITY;
	return Math.min(
		MAX_DIFF_BACKGROUND_OPACITY,
		Math.max(MIN_DIFF_BACKGROUND_OPACITY, value),
	);
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			diffBackgroundOpacity: DEFAULT_DIFF_BACKGROUND_OPACITY,
			animationPreference: DEFAULT_ANIMATION_PREFERENCE,
			update: (key, value) =>
				set({
					[key]:
						key === "diffBackgroundOpacity"
							? clampDiffBackgroundOpacity(value as number)
							: value,
				}),
		}),
		{ name: "settings" },
	),
);
