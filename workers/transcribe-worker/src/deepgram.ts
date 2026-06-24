/**
 * Deepgram realtime streaming seam — the REAL Phase-2 transcription engine.
 *
 * The worker opens ONE Deepgram live connection per audio track, pumps PCM16
 * frames in, and receives `Results` events out. The connection is modelled behind
 * a tiny `DeepgramLiveStream` interface so the orchestrator is unit-testable with a
 * FAKE stream (feed scripted results, assert fan-out + persist), while the
 * PRODUCTION factory (`createDeepgramLiveStream`) is wired to the actual
 * `@deepgram/sdk` v5 `listen.v1.connect` websocket — NO mock at runtime.
 *
 * SECURITY: the API key is passed straight into the Deepgram client and is never
 * logged. SCOPE: a LIVE transcript needs `DEEPGRAM_API_KEY` provisioned + this
 * worker deployed; the streaming code itself is real and exercised by the tests.
 */

import { DeepgramClient } from "@deepgram/sdk";
import type { DeepgramTranscriptResult } from "./mapping";

/** Options for one realtime connection (encoding fixed to PCM16 mono). */
export interface DeepgramLiveOptions {
	apiKey: string;
	model: string;
	language: string;
	/** PCM sample rate of the frames the worker will send (e.g. 16000 or 48000). */
	sampleRate: number;
}

/**
 * A live Deepgram connection the orchestrator drives. `sendAudio` pushes one PCM16
 * frame; `onResult` registers the transcript-result handler; `onError`/`onClose`
 * surface lifecycle; `finish` flushes + closes. Deliberately minimal so a fake is
 * trivial in tests and the real adapter is a thin shim over the SDK.
 */
export interface DeepgramLiveStream {
	sendAudio(frame: Uint8Array): void;
	onResult(handler: (result: DeepgramTranscriptResult) => void): void;
	onError(handler: (error: unknown) => void): void;
	onClose(handler: () => void): void;
	finish(): Promise<void>;
}

/** Factory the orchestrator calls to open one stream per track (injectable). */
export type DeepgramLiveFactory = (
	opts: DeepgramLiveOptions,
) => Promise<DeepgramLiveStream>;

/**
 * PRODUCTION factory — open a real Deepgram realtime websocket via `@deepgram/sdk`
 * v5 (`client.listen.v1.connect`). Configures PCM16 mono input, interim results,
 * punctuation, and diarization, then bridges the SDK's `message` events (the ones
 * with `type === "Results"`) to the `onResult` handler.
 *
 * v5 note: websocket boolean options are passed as STRINGS ("true"), per the
 * Deepgram v4→v5 migration guide.
 */
export const createDeepgramLiveStream: DeepgramLiveFactory = async (opts) => {
	const client = new DeepgramClient({ apiKey: opts.apiKey });
	// v5 `listen.v1.connect` requires the auth header inline on the websocket
	// connect (in addition to the client's apiKey); `Token <key>` is the Deepgram
	// websocket auth scheme. Boolean options are passed as STRINGS in v5.
	const connection = await client.listen.v1.connect({
		Authorization: `Token ${opts.apiKey}`,
		model: opts.model,
		language: opts.language,
		encoding: "linear16",
		sample_rate: opts.sampleRate,
		channels: 1,
		punctuate: "true",
		interim_results: "true",
		diarize: "true",
		smart_format: "true",
	});

	const resultHandlers: Array<(r: DeepgramTranscriptResult) => void> = [];
	const errorHandlers: Array<(e: unknown) => void> = [];
	const closeHandlers: Array<() => void> = [];

	connection.on("message", (data) => {
		// The SDK types `message` as a union of result/metadata/etc.; narrow to the
		// permissive `Results` subset the mapping consumes (cast via unknown).
		const msg = data as unknown as DeepgramTranscriptResult;
		if (msg && msg.type === "Results") {
			for (const h of resultHandlers) h(msg);
		}
	});
	connection.on("error", (error) => {
		for (const h of errorHandlers) h(error);
	});
	connection.on("close", () => {
		for (const h of closeHandlers) h();
	});

	connection.connect();
	await connection.waitForOpen();

	return {
		sendAudio(frame) {
			// `sendMedia` is the v5 audio path; the underlying socket carries PCM16.
			connection.sendMedia(frame);
		},
		onResult(handler) {
			resultHandlers.push(handler);
		},
		onError(handler) {
			errorHandlers.push(handler);
		},
		onClose(handler) {
			closeHandlers.push(handler);
		},
		async finish() {
			connection.sendFinalize({ type: "Finalize" });
			connection.close();
		},
	};
};
