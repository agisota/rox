/**
 * Edge-TTS synthesizer for the desktop main process (FN-043 / #486).
 *
 * Microsoft Edge's read-aloud neural voices are free (no API key), so the
 * "Прослушать" button on every agent reply ships to everyone by default. The
 * synthesis runs here in the main process (Node) because the read-aloud
 * WebSocket endpoint does not allow browser cross-origin connections; the
 * renderer asks via tRPC and plays back the returned mp3 bytes.
 *
 * The wire protocol (frames, SSML, audio-frame parsing) lives in the shared,
 * unit-tested `@rox/shared/tts` module so it stays platform-neutral.
 */

import {
	buildSpeechConfigMessage,
	buildSsmlMessage,
	EDGE_TTS_WSS_URL,
	edgeTtsTimestamp,
	isTurnEndFrame,
	parseBinaryFrame,
	resolveTtsVoice,
} from "@rox/shared/tts";
import { logger } from "shared/logger";

/** Hard cap on input length so a runaway reply can't hold the socket open. */
const MAX_TTS_CHARS = 8000;
/** Abort if the service hasn't finished a turn in this window. */
const SYNTHESIS_TIMEOUT_MS = 30_000;

export interface SynthesizeOptions {
	text: string;
	/** Edge-TTS short voice name; unknown/empty falls back to the default. */
	voice?: string | null;
	ratePercent?: number;
	pitchPercent?: number;
}

export interface SynthesizeResult {
	/** Base64-encoded mp3 audio. */
	audioBase64: string;
	/** MIME type of the audio payload. */
	mimeType: "audio/mpeg";
	/** Voice actually used (after fallback resolution). */
	voice: string;
}

/**
 * Synthesize `text` to mp3 via the free edge-TTS read-aloud socket. Resolves
 * once the service signals end-of-turn with the concatenated audio, or rejects
 * on socket error / timeout / empty audio.
 */
export function synthesizeSpeech(
	options: SynthesizeOptions,
): Promise<SynthesizeResult> {
	const voice = resolveTtsVoice(options.voice).id;
	const text = options.text.slice(0, MAX_TTS_CHARS).trim();

	if (!text) {
		return Promise.reject(new Error("Нечего озвучивать: пустой текст"));
	}

	return new Promise<SynthesizeResult>((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let settled = false;
		const requestId = crypto.randomUUID().replace(/-/g, "");

		const ws = new WebSocket(EDGE_TTS_WSS_URL);
		ws.binaryType = "arraybuffer";

		const timer = setTimeout(() => {
			finish(new Error("Тайм-аут синтеза речи"));
		}, SYNTHESIS_TIMEOUT_MS);

		function finish(error: Error | null) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				ws.close();
			} catch {
				// best-effort close; the socket may already be closing.
			}
			if (error) {
				reject(error);
				return;
			}
			if (chunks.length === 0) {
				reject(new Error("Сервис не вернул аудио"));
				return;
			}
			const total = chunks.reduce((n, c) => n + c.length, 0);
			const merged = new Uint8Array(total);
			let offset = 0;
			for (const c of chunks) {
				merged.set(c, offset);
				offset += c.length;
			}
			resolve({
				audioBase64: Buffer.from(merged).toString("base64"),
				mimeType: "audio/mpeg",
				voice,
			});
		}

		ws.onopen = () => {
			try {
				ws.send(buildSpeechConfigMessage(edgeTtsTimestamp()));
				ws.send(buildSsmlMessage({ voice, text }, requestId));
			} catch (err) {
				finish(err instanceof Error ? err : new Error(String(err)));
			}
		};

		ws.onmessage = (event: MessageEvent) => {
			if (typeof event.data === "string") {
				if (isTurnEndFrame(event.data)) {
					finish(null);
				}
				return;
			}
			const buffer = new Uint8Array(event.data as ArrayBuffer);
			const { audioOffset } = parseBinaryFrame(buffer);
			if (audioOffset >= 0) {
				chunks.push(buffer.subarray(audioOffset));
			}
		};

		ws.onerror = () => {
			finish(new Error("Ошибка соединения с сервисом синтеза речи"));
		};

		ws.onclose = () => {
			// If the socket closes after audio but before an explicit turn.end
			// frame, still resolve with what we have rather than hanging.
			if (!settled && chunks.length > 0) {
				finish(null);
			} else if (!settled) {
				finish(new Error("Соединение закрыто до получения аудио"));
			}
		};
	}).catch((err) => {
		logger.warn(`[edge-tts] synthesis failed: ${String(err)}`);
		throw err;
	});
}
