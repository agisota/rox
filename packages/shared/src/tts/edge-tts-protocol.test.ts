import { describe, expect, it } from "bun:test";
import {
	buildSpeechConfigMessage,
	buildSsmlMessage,
	EDGE_TTS_OUTPUT_FORMAT,
	EDGE_TTS_WSS_URL,
	escapeSsml,
	isTurnEndFrame,
	parseBinaryFrame,
} from "./edge-tts-protocol";
import { DEFAULT_TTS_VOICE, isKnownTtsVoice, resolveTtsVoice } from "./voices";

/**
 * FN-043 (#486): the edge-TTS wire protocol must be built correctly so the
 * "Прослушать" button can synthesize speech. Tested without a socket.
 */
describe("escapeSsml", () => {
	it("escapes XML-significant characters", () => {
		expect(escapeSsml(`a & b < c > d " e ' f`)).toBe(
			"a &amp; b &lt; c &gt; d &quot; e &apos; f",
		);
	});
});

describe("buildSpeechConfigMessage", () => {
	it("targets the mp3 output format on the speech.config path", () => {
		const msg = buildSpeechConfigMessage("ts");
		expect(msg).toContain("Path:speech.config");
		expect(msg).toContain(EDGE_TTS_OUTPUT_FORMAT);
	});
});

describe("buildSsmlMessage", () => {
	it("embeds the voice, request id, escaped text, and a derived locale", () => {
		const msg = buildSsmlMessage(
			{ voice: "ru-RU-DmitryNeural", text: "Привет & пока" },
			"req-123",
			"ts",
		);
		expect(msg).toContain("X-RequestId:req-123");
		expect(msg).toContain("Path:ssml");
		expect(msg).toContain("name='ru-RU-DmitryNeural'");
		expect(msg).toContain("xml:lang='ru-RU'");
		expect(msg).toContain("Привет &amp; пока");
	});

	it("clamps prosody percentages into range", () => {
		const msg = buildSsmlMessage(
			{
				voice: "en-US-AriaNeural",
				text: "hi",
				ratePercent: 999,
				pitchPercent: -999,
			},
			"r",
			"ts",
		);
		expect(msg).toContain("rate='+100%'");
		expect(msg).toContain("pitch='-100%'");
	});
});

describe("parseBinaryFrame", () => {
	it("returns the audio offset for an audio frame", () => {
		const headerText = "Path:audio\r\n";
		const headerBytes = new TextEncoder().encode(headerText);
		const audioBytes = new Uint8Array([1, 2, 3, 4]);
		const frame = new Uint8Array(2 + headerBytes.length + audioBytes.length);
		frame[0] = (headerBytes.length >> 8) & 0xff;
		frame[1] = headerBytes.length & 0xff;
		frame.set(headerBytes, 2);
		frame.set(audioBytes, 2 + headerBytes.length);

		const { audioOffset, header } = parseBinaryFrame(frame);
		expect(audioOffset).toBe(2 + headerBytes.length);
		expect(header).toContain("Path:audio");
		expect(frame.subarray(audioOffset)).toEqual(audioBytes);
	});

	it("returns -1 for a non-audio frame", () => {
		const headerText = "Path:metadata\r\n";
		const headerBytes = new TextEncoder().encode(headerText);
		const frame = new Uint8Array(2 + headerBytes.length);
		frame[0] = (headerBytes.length >> 8) & 0xff;
		frame[1] = headerBytes.length & 0xff;
		frame.set(headerBytes, 2);
		expect(parseBinaryFrame(frame).audioOffset).toBe(-1);
	});

	it("guards against truncated frames", () => {
		expect(parseBinaryFrame(new Uint8Array([0])).audioOffset).toBe(-1);
	});
});

describe("isTurnEndFrame", () => {
	it("detects the end-of-turn signal", () => {
		expect(isTurnEndFrame("X-RequestId:x\r\nPath:turn.end\r\n")).toBe(true);
		expect(isTurnEndFrame("Path:turn.start")).toBe(false);
	});
});

describe("voices catalog", () => {
	it("the default voice is a known catalog entry", () => {
		expect(isKnownTtsVoice(DEFAULT_TTS_VOICE)).toBe(true);
	});

	it("resolves unknown/null voices to the default", () => {
		expect(resolveTtsVoice("nope").id).toBe(DEFAULT_TTS_VOICE);
		expect(resolveTtsVoice(null).id).toBe(DEFAULT_TTS_VOICE);
		expect(resolveTtsVoice("en-US-GuyNeural").id).toBe("en-US-GuyNeural");
	});

	it("exposes the read-aloud endpoint over wss", () => {
		expect(EDGE_TTS_WSS_URL.startsWith("wss://")).toBe(true);
	});
});
