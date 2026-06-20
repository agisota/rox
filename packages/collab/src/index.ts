/**
 * `@rox/collab` — LiveBlocks-backed ephemeral collaboration for Rox.
 *
 * Presence, live cursors, selection highlights, and optional ephemeral CRDT
 * scratch — the layer that sits ON TOP of the durable Electric/Postgres data,
 * never replacing it. Reuses the EXISTING experimental-features env keys
 * (`LIVEBLOCKS_SECRET_KEY`, `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`).
 *
 * Entry points:
 *   - `@rox/collab`        → types + env + room-id helpers (isomorphic)
 *   - `@rox/collab/client` → `RoxRoomProvider` + typed presence hooks (client)
 *   - `@rox/collab/auth`   → `authorizeRoom` (server; mints scoped tokens)
 *   - `@rox/collab/env`    → env resolution helpers
 *   - `@rox/collab/types`  → typed Presence/Storage/UserMeta + room-id helpers
 */

export * from "./env";
export * from "./types";
