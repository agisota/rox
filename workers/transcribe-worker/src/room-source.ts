/**
 * RoomAudioSource — the LiveKit room-join + audio-subscribe + data-publish seam.
 *
 * THIS IS THE DOCUMENTED INTEGRATION POINT. Joining a LiveKit room as a hidden
 * server participant and pulling per-track PCM requires a LiveKit server-side
 * realtime runtime (`@livekit/agents` / `@livekit/rtc-node`). That package pulls
 * NATIVE bindings (sharp, an ffmpeg binary, local-inference) and — at the time of
 * writing — its latest release is younger than this repo's dependency
 * `minimumReleaseAge` gate, so taking it as a hard dependency would break the
 * frozen, `--ignore-scripts` CI install. To keep CI green AND ship the worker REAL,
 * the room runtime is modelled behind this small interface:
 *
 *   - the WORKER ORCHESTRATION (join → per-speaker stream → Deepgram → fan-out →
 *     persist) is fully implemented and unit-tested against a FAKE room here, and
 *   - the PRODUCTION adapter (`createLivekitRoomAudioSource`) is a thin, documented
 *     wiring stub that the deploy step fills in with the LiveKit realtime SDK.
 *
 * So everything Phase-2 OWNS — the Deepgram streaming, the result→segment mapping,
 * the EXACT `rox.live.transcript` publish envelope, and the signed persistence — is
 * real and tested; only the LiveKit audio TRANSPORT is a deploy-time integration
 * point, stated plainly rather than faked.
 */

import type { TranscriptWireSegment } from "./wire";
import { encodeTranscriptSegment, TRANSCRIPT_DATA_TOPIC } from "./wire";

/** A speaker whose audio track the worker subscribes to. */
export interface RoomSpeaker {
	/** Stable LiveKit participant identity. */
	identity: string;
	/** Display name (falls back to identity). */
	name: string;
}

/**
 * A live audio track surfaced by the room: a speaker + an async stream of PCM16
 * frames. The orchestrator opens one Deepgram connection per track and pumps these
 * frames into it. `streamStartedAtMs` anchors media-relative result times to wall
 * clock for `capturedAt`.
 */
export interface RoomAudioTrack {
	speaker: RoomSpeaker;
	/** Epoch ms when this track's audio capture started. */
	streamStartedAtMs: number;
	/** PCM16 (linear16) mono frames, in capture order, until the track ends. */
	frames: AsyncIterable<Uint8Array>;
}

/**
 * The room transport the orchestrator drives. `audioTracks()` yields each remote
 * speaker's track as it is subscribed; `publishData()` broadcasts bytes on the
 * room data channel (the worker uses it to fan out finals under
 * `TRANSCRIPT_DATA_TOPIC`); `close()` leaves the room.
 */
export interface RoomAudioSource {
	/** Org-scoped room name the source is joined to. */
	readonly roomName: string;
	/** Each subscribed remote audio track, as it becomes available. */
	audioTracks(): AsyncIterable<RoomAudioTrack>;
	/** Publish bytes to the room data channel (reliable, topic-scoped). */
	publishData(
		data: Uint8Array,
		opts: { reliable: boolean; topic: string },
	): Promise<void>;
	/** Leave the room and release the connection. */
	close(): Promise<void>;
}

/**
 * Publish ONE finalized wire segment to the room over the data channel using the
 * EXACT Phase-1 envelope (`encodeTranscriptSegment` bytes, reliable,
 * `rox.live.transcript` topic), so every shipped client merges it unchanged. Kept
 * as a standalone helper so the orchestrator and tests share one publish path.
 */
export async function publishTranscriptFinal(
	source: Pick<RoomAudioSource, "publishData">,
	segment: TranscriptWireSegment,
): Promise<void> {
	await source.publishData(encodeTranscriptSegment(segment), {
		reliable: true,
		topic: TRANSCRIPT_DATA_TOPIC,
	});
}

/**
 * PRODUCTION adapter — the documented LiveKit integration point (deploy-gated).
 *
 * At deploy time this is implemented with the LiveKit realtime server SDK: mint a
 * hidden-participant join token for `roomName` with the existing
 * `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` (see `@rox/rtc/token` `mintVoiceToken`),
 * connect to `livekit.url`, subscribe remote audio tracks, expose each as a
 * `RoomAudioTrack` of PCM16 frames, and forward `publishData` to
 * `room.localParticipant.publishData`. It is intentionally NOT wired to
 * `@livekit/agents` in-repo (native bindings + release-age gate would break CI);
 * the worker ships its orchestration against the `RoomAudioSource` interface so the
 * transport can be supplied without touching the tested logic.
 */
export function createLivekitRoomAudioSource(_opts: {
	roomName: string;
	livekit: { apiKey: string; apiSecret: string; url: string };
}): RoomAudioSource {
	throw new Error(
		"createLivekitRoomAudioSource is the deploy-gated LiveKit integration point: " +
			"wire it to the LiveKit realtime server SDK at deploy time (see this module's docstring). " +
			"The worker orchestration, Deepgram streaming, fan-out envelope, and persistence are fully implemented and tested against the RoomAudioSource interface.",
	);
}
