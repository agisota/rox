/**
 * Web command-palette context (F44). The platform-neutral palette core lives in
 * `@rox/shared/command-palette`; this is the web host's concrete context shape,
 * bound to Next's router navigation.
 */
export interface WebCommandContext {
	pathname: string;
	navigate: (href: string) => void;
}

export type WebSectionId = "navigation" | "actions";

export const WEB_SECTION_ORDER: WebSectionId[] = ["actions", "navigation"];

export const WEB_SECTION_LABELS: Record<WebSectionId, string> = {
	navigation: "Навигация",
	actions: "Действия",
};
