import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	animationPreference: "full" | "essential" | "off";
}

/** How much motion the app uses. The OS "Reduce motion" setting always wins. */
export type AnimationPreference = Settings["animationPreference"];

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			animationPreference: "full",
			update: (key, value) => set({ [key]: value }),
		}),
		{ name: "settings" },
	),
);
