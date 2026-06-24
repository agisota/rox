# rox-transcribe-worker — Live Transcript Phase-2 (server-side streaming STT)

The **server-side streaming** upgrade for Live Transcript. A hidden worker
participant joins an org-scoped LiveKit voice room, subscribes the audio tracks,
streams PCM to **Deepgram realtime** (`@deepgram/sdk` `listen.v1`), and on each
**final** transcript event:

1. **fans the segment out to the room** over the EXISTING Phase-1 data-channel
   envelope — `publishData(encodeTranscriptSegment(seg), { reliable: true, topic:
   "rox.live.transcript" })` — the SAME bytes `@rox/rtc`'s `reduceTranscript`
   already merges, so **every shipped client** folds the words through its
   UNCHANGED `RoomEvent.DataReceived → decodeTranscriptSegment → mergeRemote` path
   with zero client changes, and
2. **persists the final** via a signed `POST /api/voice/segment` into the SAME
   `live_transcript_segments` table the Phase-1 `voice.transcribeChunk` mutation
   writes — so streaming finals and chunked finals share one replayable log.

This is the **STT-engine swap behind the one `TranscriptSource` seam** the Phase-1
design promised (chunked Groq → streaming LiveKit+Deepgram). It is **not a new
feature flag**: `live.transcript` stays `ready` via Phase-1; Phase-2 is the
sub-second streaming upgrade on the same surface.

## Standalone

Like `workers/mesh-relay-watcher`, this is a **standalone** process — NOT part of
the Rox bun/turbo workspace. It has its own `bun.lock` and its only runtime
dependency is `@deepgram/sdk` (pure JS, no native bindings).

```sh
cd workers/transcribe-worker
bun install          # generates/updates the standalone bun.lock
bun run typecheck    # tsc --noEmit (against the real @deepgram/sdk types)
bun test             # unit tests (fake LiveKit room + fake Deepgram stream)
bun run start <room> # boot for one room, e.g. org:<org>:voice:<channelId>
```

## What is fully wired vs a documented integration point

| Part | Status |
| --- | --- |
| Deepgram realtime streaming (`listen.v1.connect`, PCM16, diarization) | **Real** — `src/deepgram.ts`, typechecks against `@deepgram/sdk@5.4.0` |
| Deepgram `Results` → transcript wire segment (final/partial/silence/speaker) | **Real + unit-tested** — `src/mapping.ts` |
| Fan-out envelope (`rox.live.transcript`, reliable, byte-identical to `@rox/rtc`) | **Real + golden-vector-tested** — `src/wire.ts`, `src/room-source.ts` |
| Signed persistence `POST /api/voice/segment` (HMAC, mirrors mesh inbound) | **Real client half + unit-tested** — `src/segment-writer.ts` |
| Worker orchestration (join → stream → map → persist → fan-out) | **Real + unit-tested** — `src/worker.ts` (fake room + fake Deepgram) |
| LiveKit room JOIN + per-track PCM (`createLivekitRoomAudioSource`) | **Documented integration point** — `src/room-source.ts` |
| `livekit-deepgram` source registration behind the Phase-1 seam | **Real + in-CI** — `packages/rtc/src/transcript.ts` (`createLivekitDeepgramServerSource`) |

### Why the LiveKit room join is a documented integration point

Joining a LiveKit room server-side and pulling per-track PCM needs
`@livekit/agents` / `@livekit/rtc-node`, which pull **native bindings** (`sharp`,
a bundled `ffmpeg` binary, `@livekit/local-inference`) and whose latest release is
**younger than this repo's `minimumReleaseAge` gate** — taking it as a hard
dependency would break the frozen, `--ignore-scripts` CI install. So the worker
ships its full orchestration against a small `RoomAudioSource` interface; the
production adapter (`createLivekitRoomAudioSource`) is a thin, documented wiring
stub the deploy step fills in with the LiveKit realtime SDK (mint a hidden-
participant token via `@rox/rtc/token` `mintVoiceToken`, connect to the SFU,
subscribe remote audio, expose PCM16 frames, forward `publishData`). Everything
Phase-2 OWNS is real and tested; only the audio **transport** is deploy-time.

## Deploy follow-up (LIVE path — OUTSIDE CI)

A LIVE sub-second transcript requires, on an always-on host (Fly / the relay lane):

1. **Secrets (env only; never logged/committed):**
   - `DEEPGRAM_API_KEY` — Deepgram realtime auth.
   - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — existing LiveKit server creds.
   - `TRANSCRIBE_INGEST_SECRET` — HMAC shared secret for `POST /api/voice/segment`
     (provision the matching verifier on the rox API side).
   - `LIVEKIT_URL` (or `NEXT_PUBLIC_LIVEKIT_URL`), `ROX_API_URL`.
2. **Wire `createLivekitRoomAudioSource`** to the LiveKit realtime SDK (see its
   docstring) — the one remaining transport integration point.
3. **Add the `POST /api/voice/segment` route** on the rox API that verifies the
   HMAC headers (`x-rox-transcript-signature/-timestamp/-nonce`) and inserts the
   row (mirrors `/api/mesh/inbound`).
4. **Deploy** this process (e.g. `fly deploy`) and dispatch it per active room.

Until the worker is deployed and these are provisioned, `live.transcript` keeps
its Phase-1 chunked behavior. **Do not** flip any flag to claim live Phase-2
before the worker is deployed.

## Security

Secrets are read from the environment and used only to authenticate (Deepgram
client, the LiveKit token, the persistence HMAC). They are **never** logged,
echoed, placed in a body, or committed. A misconfigured deploy fails fast with a
**variable-name-only** error.
