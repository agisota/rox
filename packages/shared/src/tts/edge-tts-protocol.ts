/**
 * Edge-TTS wire-protocol helpers (FN-043 / #486).
 *
 * Microsoft's read-aloud service speaks a small framed protocol over a single
 * WebSocket: a JSON `speech.config` message, then an SSML `ssml` message; the
 * server streams back text headers ("turn.start"/"response") and binary audio
 * frames whose payload is the requested format (mp3). These helpers build the
 * exact frames and locate the audio payload offset, kept pure here so they can
 * be unit-tested without a socket and reused by any platform transport.
 *
 * `TRUSTED_CLIENT_TOKEN` is the public, well-known token the Edge browser itself
 * sends for the free read-aloud endpoint — it is NOT a secret credential.
 */

export const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export const EDGE_TTS_WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

/** Output audio format negotiated with the service (mp3 @ 24kHz). */
export const EDGE_TTS_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** Escape a string for safe inclusion inside SSML text content. */
export function escapeSsml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** A timestamp in the format the service expects for message headers. */
export function edgeTtsTimestamp(date: Date = new Date()): string {
	return `${date.toString()}Z`;
}

/** The `speech.config` frame: tells the service which audio format to stream. */
export function buildSpeechConfigMessage(
	timestamp: string = edgeTtsTimestamp(),
): string {
	const config = {
		context: {
			synthesis: {
				audio: {
					metadataoptions: {
						sentenceBoundaryEnabled: "false",
						wordBoundaryEnabled: "false",
					},
					outputFormat: EDGE_TTS_OUTPUT_FORMAT,
				},
			},
		},
	};
	return [
		`X-Timestamp:${timestamp}`,
		"Content-Type:application/json; charset=utf-8",
		"Path:speech.config",
		"",
		JSON.stringify(config),
	].join("\r\n");
}

/** Clamp a percent-style prosody value into edge-TTS's accepted range. */
function clampPercent(value: number): number {
	return Math.max(-100, Math.min(100, Math.round(value)));
}

export interface SsmlOptions {
	/** Edge-TTS short voice name, e.g. "ru-RU-DmitryNeural". */
	voice: string;
	/** Text to speak (will be SSML-escaped). */
	text: string;
	/** Rate adjustment in percent (-100..100), default 0. */
	ratePercent?: number;
	/** Pitch adjustment in percent (-100..100), default 0. */
	pitchPercent?: number;
}

/** Build the SSML `ssml` frame for a single utterance. */
export function buildSsmlMessage(
	options: SsmlOptions,
	requestId: string,
	timestamp: string = edgeTtsTimestamp(),
): string {
	const rate = clampPercent(options.ratePercent ?? 0);
	const pitch = clampPercent(options.pitchPercent ?? 0);
	const locale = options.voice.split("-").slice(0, 2).join("-");
	const ssml =
		`<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
		`<voice name='${options.voice}'>` +
		`<prosody pitch='${pitch >= 0 ? "+" : ""}${pitch}%' rate='${rate >= 0 ? "+" : ""}${rate}%' volume='+0%'>` +
		`${escapeSsml(options.text)}` +
		`</prosody></voice></speak>`;

	return [
		`X-RequestId:${requestId}`,
		"Content-Type:application/ssml+xml",
		`X-Timestamp:${timestamp}`,
		"Path:ssml",
		"",
		ssml,
	].join("\r\n");
}

/**
 * Locate the audio payload inside a binary frame. Audio frames are
 * `[2-byte big-endian header length][text header][binary audio]`. Returns the
 * byte offset where the audio starts, or -1 when the frame is not audio (e.g. a
 * metadata frame). `header` is the decoded text header for `Path:` inspection.
 */
export function parseBinaryFrame(buffer: Uint8Array): {
	audioOffset: number;
	header: string;
} {
	const highByte = buffer[0];
	const lowByte = buffer[1];
	if (highByte === undefined || lowByte === undefined) {
		return { audioOffset: -1, header: "" };
	}
	const headerLength = (highByte << 8) + lowByte;
	const headerStart = 2;
	const audioStart = headerStart + headerLength;
	if (audioStart > buffer.length) {
		return { audioOffset: -1, header: "" };
	}
	const header = new TextDecoder().decode(
		buffer.subarray(headerStart, audioStart),
	);
	const isAudio = header.includes("Path:audio");
	return { audioOffset: isAudio ? audioStart : -1, header };
}

/** True when a text frame signals the end of the synthesis turn. */
export function isTurnEndFrame(message: string): boolean {
	return message.includes("Path:turn.end");
}
