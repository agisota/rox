"use client";

import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import {
	DEFAULT_LOCALE,
	isLocale,
	LOCALE_STORAGE_KEY,
	type Locale,
} from "../constants";
import { type Dictionary, getDictionary } from "../dictionaries";

export interface I18nContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	/** The active dictionary. Access strings as `t.namespace.key`. */
	t: Dictionary;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Client-side i18n provider. Mirrors the `next-themes` approach: it renders with
 * {@link DEFAULT_LOCALE} (`ru`) on the server and first client paint — so there
 * is no hydration mismatch — then hydrates the persisted choice from
 * localStorage on mount.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

	useEffect(() => {
		const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
		if (isLocale(stored)) {
			setLocaleState(stored);
		}
	}, []);

	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);

	const setLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
	}, []);

	const value = useMemo<I18nContextValue>(
		() => ({ locale, setLocale, t: getDictionary(locale) }),
		[locale, setLocale],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
