/**
 * `@rox/rtc` — LiveKit-backed realtime media (audio/video/screenshare) for Rox.
 *
 * The transport Electric/relay structurally cannot provide. Reuses the EXISTING
 * experimental-features env keys (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
 * `NEXT_PUBLIC_LIVEKIT_URL`). Distinct from `voice_transcriptions` (dictation).
 *
 * Entry points:
 *   - `@rox/rtc`        → types + env + room-name helpers (isomorphic)
 *   - `@rox/rtc/client` → `useVoiceRoom` + `RoxRoomAudioRenderer` (client)
 *   - `@rox/rtc/token`  → `mintVoiceToken` (server; mints scoped access tokens)
 *   - `@rox/rtc/env`    → env resolution helpers
 *   - `@rox/rtc/types`  → connection-state + room-name helpers
 */

export * from "./env";
export * from "./types";
