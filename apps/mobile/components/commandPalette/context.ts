import type { Href } from "expo-router";

/**
 * Mobile command-palette context (F44). The platform-neutral palette core lives
 * in `@rox/shared/command-palette`; this is the RN host's concrete context
 * shape, bound to expo-router navigation.
 */
export interface MobileCommandContext {
	navigate: (href: Href) => void;
}

export type MobileSectionId = "navigation" | "actions";

export const MOBILE_SECTION_ORDER: MobileSectionId[] = [
	"actions",
	"navigation",
];

export const MOBILE_SECTION_LABELS: Record<MobileSectionId, string> = {
	navigation: "Навигация",
	actions: "Действия",
};
