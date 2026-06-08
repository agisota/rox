/**
 * i18n configuration for the Rox One web app.
 *
 * Russian (`ru`) is the default locale; English (`en`) remains available and the
 * user's choice is persisted in localStorage under {@link LOCALE_STORAGE_KEY}.
 */

export const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

/** localStorage key holding the user's selected locale. */
export const LOCALE_STORAGE_KEY = "rox-locale";

/** Human-readable, self-referential labels for each locale. */
export const LOCALE_LABELS: Record<Locale, string> = {
	ru: "Русский",
	en: "English",
};

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" && (LOCALES as readonly string[]).includes(value)
	);
}
