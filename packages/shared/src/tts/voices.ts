/**
 * Edge-TTS voice catalog (FN-043 / #486).
 *
 * Microsoft Edge's read-aloud neural voices are free to use (no API key), so the
 * "Прослушать" button can ship to everyone by default. This is a curated subset
 * — Russian-first (the product's primary language) plus a few common English
 * voices — exposed in Settings → Voice. Platform-neutral so desktop, web, and
 * mobile share one source of truth.
 */

export interface TtsVoice {
	/** Edge-TTS short voice name, e.g. "ru-RU-DmitryNeural". */
	id: string;
	/** Human label shown in settings. */
	label: string;
	/** BCP-47 locale the voice speaks. */
	locale: string;
	/** Perceived gender, for grouping in the picker. */
	gender: "male" | "female";
}

export const TTS_VOICES: readonly TtsVoice[] = [
	// Russian (primary)
	{
		id: "ru-RU-DmitryNeural",
		label: "Дмитрий (муж.)",
		locale: "ru-RU",
		gender: "male",
	},
	{
		id: "ru-RU-SvetlanaNeural",
		label: "Светлана (жен.)",
		locale: "ru-RU",
		gender: "female",
	},
	{
		id: "ru-RU-DariyaNeural",
		label: "Дария (жен.)",
		locale: "ru-RU",
		gender: "female",
	},
	// English (US)
	{
		id: "en-US-AriaNeural",
		label: "Aria (en-US, жен.)",
		locale: "en-US",
		gender: "female",
	},
	{
		id: "en-US-GuyNeural",
		label: "Guy (en-US, муж.)",
		locale: "en-US",
		gender: "male",
	},
	// English (UK)
	{
		id: "en-GB-SoniaNeural",
		label: "Sonia (en-GB, жен.)",
		locale: "en-GB",
		gender: "female",
	},
] as const;

/** Default voice — Russian male, matching the product's primary language. */
export const DEFAULT_TTS_VOICE = "ru-RU-DmitryNeural";

/**
 * The default voice's catalog entry. Resolved once at module load; throws if the
 * catalog and {@link DEFAULT_TTS_VOICE} ever drift apart (a programming error),
 * which also gives `resolveTtsVoice` a non-undefined fallback under strict
 * indexed access.
 */
const DEFAULT_TTS_VOICE_ENTRY: TtsVoice = (() => {
	const entry = TTS_VOICES.find((v) => v.id === DEFAULT_TTS_VOICE);
	if (!entry) {
		throw new Error(
			`DEFAULT_TTS_VOICE ${DEFAULT_TTS_VOICE} missing from catalog`,
		);
	}
	return entry;
})();

/** Whether `id` is a known voice in the catalog. */
export function isKnownTtsVoice(id: string): boolean {
	return TTS_VOICES.some((v) => v.id === id);
}

/** Resolve a voice id to a catalog entry, falling back to the default. */
export function resolveTtsVoice(id: string | null | undefined): TtsVoice {
	const found = id ? TTS_VOICES.find((v) => v.id === id) : undefined;
	return found ?? DEFAULT_TTS_VOICE_ENTRY;
}
