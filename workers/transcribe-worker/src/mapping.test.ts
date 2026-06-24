import { describe, expect, test } from "bun:test";

import {
	type DeepgramTranscriptResult,
	deepgramCapturedAt,
	mapDeepgramResultToWire,
	type ServerTranscriptContext,
} from "./mapping";

function dgResult(
	p: Partial<DeepgramTranscriptResult> = {},
): DeepgramTranscriptResult {
	return {
		type: "Results",
		is_final: true,
		start: 0,
		duration: 0,
		channel: { alternatives: [{ transcript: "привет мир" }] },
		...p,
	};
}

function ctx(
	p: Partial<ServerTranscriptContext> = {},
): ServerTranscriptContext {
	return {
		roomName: "org:o1:voice:c1",
		speakerIdentity: "user-7",
		speakerName: "Ада",
		now: () => 5_000,
		...p,
	};
}

describe("mapDeepgramResultToWire", () => {
	test("maps a FINAL result to a trimmed wire segment", () => {
		const wire = mapDeepgramResultToWire(
			dgResult({ channel: { alternatives: [{ transcript: "  привет  " }] } }),
			ctx(),
		);
		expect(wire).toEqual({
			id: "user-7:5000:final",
			speakerIdentity: "user-7",
			speakerName: "Ада",
			text: "привет",
			language: null,
			capturedAt: 5_000,
		});
	});

	test("drops an interim partial (is_final=false)", () => {
		expect(
			mapDeepgramResultToWire(dgResult({ is_final: false }), ctx()),
		).toBeNull();
	});

	test("drops empty/whitespace transcript (silence)", () => {
		expect(
			mapDeepgramResultToWire(
				dgResult({ channel: { alternatives: [{ transcript: "  " }] } }),
				ctx(),
			),
		).toBeNull();
		expect(
			mapDeepgramResultToWire(
				dgResult({ channel: { alternatives: [] } }),
				ctx(),
			),
		).toBeNull();
	});

	test("suffixes the dominant diarization speaker, keeps real identity", () => {
		const wire = mapDeepgramResultToWire(
			dgResult({
				channel: {
					alternatives: [
						{
							transcript: "две реплики",
							words: [
								{ word: "две", speaker: 2 },
								{ word: "реплики", speaker: 2 },
								{ word: "эхо", speaker: 0 },
							],
						},
					],
				},
			}),
			ctx(),
		);
		expect(wire?.speakerName).toBe("Ада #2");
		expect(wire?.speakerIdentity).toBe("user-7");
	});

	test("carries the connection language onto the segment", () => {
		const wire = mapDeepgramResultToWire(dgResult(), ctx({ language: "ru" }));
		expect(wire?.language).toBe("ru");
	});

	test("prefers an explicit persisted segmentId for dedupe", () => {
		const wire = mapDeepgramResultToWire(
			dgResult(),
			ctx({ segmentId: "row-9" }),
		);
		expect(wire?.id).toBe("row-9");
	});

	test("falls back to identity when speakerName blank", () => {
		const wire = mapDeepgramResultToWire(dgResult(), ctx({ speakerName: "" }));
		expect(wire?.speakerName).toBe("user-7");
	});
});

describe("deepgramCapturedAt", () => {
	test("anchors media start+duration to wall clock", () => {
		expect(
			deepgramCapturedAt(
				{ start: 3, duration: 0.25 },
				{ streamStartedAtMs: 1_000_000 },
			),
		).toBe(1_003_250);
	});

	test("uses the injected clock without a stream anchor", () => {
		expect(deepgramCapturedAt({ start: 9 }, { now: () => 42 })).toBe(42);
	});
});
