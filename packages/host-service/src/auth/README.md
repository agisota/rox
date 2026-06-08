# Shared session inheritance (web ↔ desktop)

`durable-session.ts` is the single source of truth for **who is signed in on a
host**, shared between the WebUI (`apps/web`, `app.rox.one`) and the desktop app
(`apps/desktop`). A registration / sign-in performed on one surface is inherited
by the other, and a sign-out clears the session everywhere on the host.

## Why a shared store

Before this, the desktop kept its session in `~/.rox/auth-token.enc`, written
only by the OAuth deep-link handoff. Nothing else on the host could read it, so
the desktop and any other local surface (the host-service that serves terminals,
chat, etc.) held independent, drifting views of "logged in".

`DurableSessionStore` makes the session a **host-level fact** instead of a
desktop-local one:

- **Location** — `$ROX_HOME_DIR/durable-session.enc` (default `~/.rox/...`),
  the same `ROX_HOME_DIR` both the desktop main process and the host-service
  daemon already resolve.
- **Encryption** — AES-256-GCM under a key derived from the machine id
  (`@rox/shared/host-info#getMachineId`), the same scheme as the desktop's
  `crypto-storage`. The file is `0600` inside the `0700` Rox home dir. The token
  is a Better Auth bearer session (a row in `auth.sessions`); possession ⇒ acting
  as the user, hence encryption at rest.
- **API** — `read()`, `write()`, `clear()`, `isLive()`, `subscribe()`, plus a
  process-wide `getDurableSessionStore()` singleton.

## Propagation flow

```
WebUI sign-in (app.rox.one)
   │  OAuth → /api/auth/desktop/connect → /auth/desktop/success
   │  mints a sessions row, hands token to desktop via deep link / local callback
   ▼
Desktop bridge  apps/desktop/.../auth/utils/auth-functions.ts
   saveToken()  ─ writes ~/.rox/auth-token.enc  (desktop-local cache)
                └ write-through → DurableSessionStore.write()   ← shared
   ▼
Host-service (local + remote hosts)  @rox/host-service/auth
   getDurableSessionStore().read()  ← inherits the same session
```

- **Web → desktop**: the existing deep-link handoff still delivers the token;
  `saveToken` now also write-throughs to the shared store.
- **Desktop → other surfaces**: any host-service-backed client reads the shared
  store and inherits the session without a second OAuth round trip.
- **Inheritance on cold start**: if the desktop has no local token, `loadToken`
  falls back to the shared store, adopting a session established elsewhere.
- **Sign-out**: `clearToken()` deletes the desktop cache **and** clears the
  shared store, propagating sign-out to every surface; `subscribe()` lets live
  clients react.

## Tests

`durable-session.test.ts` asserts persistence and inheritance: a session written
by one store instance is read back by an independently-constructed store at the
same path (the web→desktop / desktop→host-service inheritance), encryption at
rest, expiry via `isLive`, sign-out via `clear`, change broadcasts, and
corrupt-file resilience.
