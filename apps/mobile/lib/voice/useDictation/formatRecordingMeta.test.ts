import { describe, expect, test } from "bun:test";
import { formatRecordingMeta, MOBILE_AUDIO_MIME } from "./formatRecordingMeta";

describe("formatRecordingMeta", () => {
	test("rounds a fractional duration and keeps the default mime", () => {
		expect(formatRecordingMeta(1234.7)).toEqual({
			mimeType: MOBILE_AUDIO_MIME,
			durationMs: 1235,
		});
	});

	test("collapses null/undefined/NaN/negative duration to 0", () => {
		expect(formatRecordingMeta(null).durationMs).toBe(0);
		expect(formatRecordingMeta(undefined).durationMs).toBe(0);
		expect(formatRecordingMeta(Number.NaN).durationMs).toBe(0);
		expect(formatRecordingMeta(-50).durationMs).toBe(0);
	});

	test("passes a custom mime through, falling back when empty", () => {
		expect(formatRecordingMeta(10, "audio/mp4").mimeType).toBe("audio/mp4");
		expect(formatRecordingMeta(10, "").mimeType).toBe(MOBILE_AUDIO_MIME);
	});
});
