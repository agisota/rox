import { describe, expect, test } from "bun:test";

import {
	encodeTranscriptSegment,
	TRANSCRIPT_DATA_TOPIC,
	type TranscriptWireSegment,
} from "./wire";

describe("transcript wire codec (vendored, byte-conformant)", () => {
	test("topic matches the Phase-1 fan-out topic exactly", () => {
		// Must equal `@rox/rtc`'s `TRANSCRIPT_DATA_TOPIC` so clients accept the frame.
		expect(TRANSCRIPT_DATA_TOPIC).toBe("rox.live.transcript");
	});

	test("encodes to the canonical JSON shape + field order (golden vector)", () => {
		const wire: TranscriptWireSegment = {
			id: "seg-1",
			speakerIdentity: "user-7",
			speakerName: "Ada",
			text: "hello",
			language: "en",
			capturedAt: 1234,
		};
		// The EXACT JSON `@rox/rtc`'s encoder emits: keys in
		// id, speakerIdentity, speakerName, text, language, capturedAt order.
		const golden =
			'{"id":"seg-1","speakerIdentity":"user-7","speakerName":"Ada","text":"hello","language":"en","capturedAt":1234}';
		const bytes = encodeTranscriptSegment(wire);
		expect(new TextDecoder().decode(bytes)).toBe(golden);
		expect(Array.from(bytes)).toEqual(
			Array.from(new TextEncoder().encode(golden)),
		);
	});

	test("serializes a null language as JSON null (not omitted)", () => {
		const bytes = encodeTranscriptSegment({
			id: "x",
			speakerIdentity: "i",
			speakerName: "n",
			text: "t",
			language: null,
			capturedAt: 1,
		});
		expect(JSON.parse(new TextDecoder().decode(bytes)).language).toBeNull();
	});

	test("round-trips through JSON.parse to the same fields", () => {
		const wire: TranscriptWireSegment = {
			id: "seg-2",
			speakerIdentity: "user-2",
			speakerName: "Боб",
			text: "привет",
			language: "ru",
			capturedAt: 9999,
		};
		const decoded = JSON.parse(
			new TextDecoder().decode(encodeTranscriptSegment(wire)),
		);
		expect(decoded).toEqual(wire);
	});
});
