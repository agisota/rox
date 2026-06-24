# transcribe-worker — Deploy Runbook (Fly.io)

The transcribe-worker **dispatcher** runs as a single always-on Fly machine. It polls
LiveKit for active org voice rooms (`org:<org>:voice:<channel>`) and spawns one
streaming transcription **child process** per room. Each child joins the room as a
hidden participant, streams PCM to Deepgram realtime, fans each FINAL back to the room
on the `rox.live.transcript` data topic, and persists it via a signed POST to the rox
API. When a room ends, its child is reaped; if a child crashes while its room is still
active, it is restarted with backoff.

This is the **server-side STT runtime**. It is STANDALONE — not in the rox bun/turbo
workspace and not built by the main CI. It has its own `package.json` + `bun.lock` and
its own `Dockerfile` / `fly.toml` in this directory.

---

## 0. Files in this deploy

| File | Role |
|------|------|
| `Dockerfile` | Node-22 runtime image; `bun install` materializes `node_modules`, process runs via `tsx`. |
| `fly.toml` | App `rox-transcribe-worker`, region `sjc`, one always-on machine, **non-secret** `[env]` only. |
| `src/dispatch.ts` | The dispatcher: `reconcileRooms` (pure) + `runDispatcher` (poll/spawn/reap supervisor). |
| `src/index.ts` | The single-room worker entry: `main(roomName)`. The dispatcher spawns `tsx src/index.ts <room>`. |

---

## 1. Prerequisites

```bash
# Install + auth the Fly CLI (one-time).
brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

You also need:

- A LiveKit deployment (URL + API key/secret) — the SAME one the rox app uses.
- A Deepgram API key with realtime streaming.
- The rox API base URL and the `TRANSCRIBE_INGEST_SECRET` HMAC secret (see CRITICAL).

---

## 2. Create the app (no deploy yet)

From this directory (`workers/transcribe-worker`):

```bash
# Create the Fly app from the existing fly.toml WITHOUT building/deploying.
fly launch --no-deploy --copy-config --name rox-transcribe-worker --region sjc
# If the app already exists, skip launch and just ensure config is current:
#   fly apps create rox-transcribe-worker   # (only if it does not exist)
```

`fly launch` may offer to tweak `fly.toml`; keep the committed file (it already sets
the region, the single always-on machine, and the non-secret `[env]`). Do **not** let
it add a public `[http_service]` — this worker serves no public traffic.

---

## 3. Set secrets (NEVER commit these)

Secrets are set via `fly secrets set`, which stores them encrypted and injects them as
env vars at runtime. They are **never** in `fly.toml` and never logged by the worker.

```bash
fly secrets set \
  DEEPGRAM_API_KEY=<SET_THIS> \
  LIVEKIT_API_KEY=<SET_THIS> \
  LIVEKIT_API_SECRET=<SET_THIS> \
  LIVEKIT_URL=<SET_THIS> \
  ROX_API_URL=<SET_THIS> \
  TRANSCRIBE_INGEST_SECRET=<SET_THIS> \
  --app rox-transcribe-worker
```

Env var meanings (see `src/config.ts`):

| Var | Secret? | Meaning |
|-----|---------|---------|
| `DEEPGRAM_API_KEY` | yes | Deepgram realtime STT auth. |
| `LIVEKIT_URL` | yes¹ | LiveKit SFU **wss** URL. The dispatcher derives the `https` host for `RoomServiceClient` from it. |
| `LIVEKIT_API_KEY` | yes | Signs the worker's room-join JWT and the `listRooms()` API calls. |
| `LIVEKIT_API_SECRET` | yes | Signs the worker's room-join JWT and the `listRooms()` API calls. |
| `ROX_API_URL` | no² | rox API base for the signed `POST /api/voice/segment`. |
| `TRANSCRIBE_INGEST_SECRET` | yes | HMAC shared secret for that POST (see CRITICAL). |
| `DEEPGRAM_MODEL` | no | Optional; defaults to `nova-3` (set in `fly.toml`). |
| `DEEPGRAM_LANGUAGE` | no | Optional; defaults to `multi` (set in `fly.toml`). |
| `PORT` | no | Set in `fly.toml` to `8080`; enables the internal `/health` server for the Fly check. |

¹ `LIVEKIT_URL` is not strictly secret but is set via `fly secrets set` alongside the
keys for convenience; you may instead add it to `[env]` if you prefer. Keep the
API key/secret out of `fly.toml` regardless.
² `ROX_API_URL` is not secret; set via secrets or `[env]`, your choice.

---

## 4. Deploy

```bash
fly deploy --app rox-transcribe-worker
```

This builds the `Dockerfile` (Bun installs `node_modules`, Node runs the dispatcher via
`tsx`) and boots the single machine.

### Verify it is live

```bash
# Machine + health-check status (health = 200 only when every secret/url is present).
fly status --app rox-transcribe-worker

# Stream dispatcher logs — look for:
#   "dispatcher: starting — host=https://... poll=10000ms ..."
#   "dispatcher: worker spawned room=org:<org>:voice:<channel> pid=..."  (when a room is live)
fly logs --app rox-transcribe-worker
```

To confirm end to end, join a voice channel in the rox app and watch the logs for a
`worker spawned room=org:...:voice:...` line, then a live transcript appearing in the
room.

---

## 5. CRITICAL — shared ingest secret + Node-only runtime

> **`TRANSCRIBE_INGEST_SECRET` must be IDENTICAL on the worker and the rox API.**
> The worker signs `POST /api/voice/segment` with an HMAC of this secret; the rox API
> handler (`POST /api/voice/segment`, the STT Phase-2 ingest) verifies the signature
> with the **same** secret. If they differ, every persist is rejected (the live
> fan-out still works, but transcripts are **not** durably stored). The rox API runs
> on **Render** — set `TRANSCRIBE_INGEST_SECRET` there to the exact same value you set
> here with `fly secrets set`. Generate it once (e.g. `openssl rand -hex 32`) and set
> it in **both** places.

> **The worker MUST run on NODE, not Bun.** `@deepgram/sdk@5.4.0`'s realtime websocket
> sets the underlying `ws` `binaryType = "blob"`, which **Bun's** WebSocket rejects, so
> the streaming worker fails under Bun. `@livekit/rtc-node` is additionally a native
> Node addon. The `Dockerfile` therefore installs `node_modules` with Bun (fast) but
> runs the process on a `node:22-slim` image via **`tsx`** (`tsx src/dispatch.ts`).
> `tsx` (an esbuild loader on Node) is required because plain `node` cannot resolve
> this worker's extensionless TS ESM imports. **Do not** change the `CMD` to `bun run`.

---

## 6. SECURITY

- **Rotate any credential that was ever shared out of band** (pasted in chat, a ticket,
  a shared doc, etc.): the Deepgram key, the LiveKit API key/secret, and especially the
  `TRANSCRIBE_INGEST_SECRET`. After rotating, re-run `fly secrets set` here AND update
  the matching value on the rox API (Render), then redeploy both.
- Secrets are read from the environment only and are **never logged** by the worker
  (`src/config.ts` throws var-name-only errors; the dispatcher logs room names + pids,
  never secret values).
- Never commit secret values, put them in `fly.toml`, or echo them in CI. `fly.toml`
  `[env]` is for non-secret config only.

---

## 7. Operations

```bash
# Restart (e.g. after rotating secrets):
fly deploy --app rox-transcribe-worker        # picks up new secrets + image
# or, without rebuilding, just restart the machine:
fly machine restart --app rox-transcribe-worker <machine-id>

# Scale memory if many concurrent rooms (each child holds a LiveKit + Deepgram socket):
fly scale memory 2048 --app rox-transcribe-worker

# Tail logs:
fly logs --app rox-transcribe-worker
```

The dispatcher keeps **one machine**; concurrency is handled by spawning more child
processes inside it, not more machines. If a single machine cannot hold all active
rooms, raise its memory/CPU (`fly scale`) rather than adding machines (multiple
dispatchers would double-spawn the same rooms).
