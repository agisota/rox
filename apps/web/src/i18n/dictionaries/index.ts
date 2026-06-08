import type { Locale } from "../constants";
import { type Dictionary, en } from "./en";
import { ru } from "./ru";

export type { Dictionary } from "./en";

export const dictionaries: Record<Locale, Dictionary> = {
	ru,
	en,
};

export function getDictionary(locale: Locale): Dictionary {
	return dictionaries[locale];
}
