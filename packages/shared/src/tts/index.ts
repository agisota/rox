/**
 * Shared text-to-speech surface (FN-043 / #486).
 *
 * Platform-neutral voice catalog + edge-TTS wire-protocol helpers so desktop,
 * web, and mobile reuse one source of truth. The actual socket transport lives
 * at the platform edge (e.g. the desktop main process).
 */

export {
	buildSpeechConfigMessage,
	buildSsmlMessage,
	EDGE_TTS_OUTPUT_FORMAT,
	EDGE_TTS_WSS_URL,
	edgeTtsTimestamp,
	escapeSsml,
	isTurnEndFrame,
	parseBinaryFrame,
	type SsmlOptions,
	TRUSTED_CLIENT_TOKEN,
} from "./edge-tts-protocol";
export {
	DEFAULT_TTS_VOICE,
	isKnownTtsVoice,
	resolveTtsVoice,
	TTS_VOICES,
	type TtsVoice,
} from "./voices";
