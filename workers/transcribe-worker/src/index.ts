/**
 * Transcribe-worker entrypoint (Live Transcript Phase-2).
 *
 * Boots the SERVER-SIDE streaming transcription worker: join an org-scoped LiveKit
 * voice room as a hidden participant, subscribe the audio tracks, stream PCM to
 * Deepgram realtime, and fan each FINAL back to the room through the EXISTING
 * Phase-1 envelope (`rox.live.transcript`) while persisting it via a signed POST.
 *
 * STANDALONE (not in the bun/turbo workspace), mirroring `workers/mesh-relay-watcher`.
 *
 * SCOPE HONESTY: a LIVE sub-second transcript needs (1) `DEEPGRAM_API_KEY`
 * provisioned, (2) the existing `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` + SFU url,
 * (3) `ROX_API_URL` + `TRANSCRIBE_INGEST_SECRET` for persistence, AND (4) the
 * `createLivekitRoomAudioSource` LiveKit transport wired at deploy time (see
 * `room-source.ts`). That deploy is a follow-up OUTSIDE CI. This module is the
 * runnable orchestration; everything Phase-2 owns (Deepgram streaming, mapping,
 * fan-out envelope, signed persistence) is real and unit-tested.
 *
 * SECURITY: secrets are read from the environment and never logged.
 */

import { readConfigFromEnv } from "./config";
import { createDeepgramLiveStream } from "./deepgram";
import { createLivekitRoomAudioSource } from "./room-source";
import { createSignedSegmentWriter } from "./segment-writer";
import { runTranscribeWorker, type TranscribeWorkerHandle } from "./worker";

export { isWorkerConfigured, readConfigFromEnv } from "./config";
export {
	createDeepgramLiveStream,
	type DeepgramLiveFactory,
	type DeepgramLiveStream,
} from "./deepgram";
export {
	type DeepgramTranscriptResult,
	deepgramCapturedAt,
	mapDeepgramResultToWire,
	type ServerTranscriptContext,
} from "./mapping";
export {
	createLivekitRoomAudioSource,
	publishTranscriptFinal,
	type RoomAudioSource,
	type RoomAudioTrack,
} from "./room-source";
export {
	buildSignedSegmentRequest,
	computeSegmentSignature,
	createSignedSegmentWriter,
	type SegmentWriter,
} from "./segment-writer";
export { encodeTranscriptSegment, TRANSCRIPT_DATA_TOPIC } from "./wire";
export {
	type RunTranscribeWorkerOptions,
	runTranscribeWorker,
	type TranscribeWorkerHandle,
} from "./worker";

/**
 * Boot the worker from the environment for one room (the deploy-wave entrypoint).
 * `roomName` is supplied by the deploy invocation (e.g. argv / a dispatch message);
 * the LiveKit transport is the deploy-gated `createLivekitRoomAudioSource`.
 */
export function main(
	roomName: string,
	env: Record<string, string | undefined> = process.env,
): TranscribeWorkerHandle {
	const config = readConfigFromEnv(env);
	const room = createLivekitRoomAudioSource({
		roomName,
		livekit: config.livekit,
	});
	return runTranscribeWorker({
		room,
		openDeepgram: createDeepgramLiveStream,
		writeSegment: createSignedSegmentWriter({
			apiUrl: config.apiUrl,
			secret: config.ingestSecret,
		}),
		deepgram: {
			apiKey: config.deepgramApiKey,
			model: config.model,
			language: config.language,
			// 48kHz is LiveKit's default Opus capture rate; the transport adapter
			// decodes to PCM16 mono at this rate before handing frames to Deepgram.
			sampleRate: 48000,
		},
	});
}

// Run only when invoked directly (`bun src/index.ts <roomName>` / compiled), never
// on test import — so importing this module never opens a LiveKit/Deepgram socket.
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	import.meta.url === `file://${process.argv[1]}`
) {
	const roomName = process.argv[2];
	if (!roomName) {
		console.error(
			"usage: transcribe-worker <roomName>  (e.g. org:<org>:voice:<channelId>)",
		);
		process.exit(1);
	}
	main(roomName);
}
