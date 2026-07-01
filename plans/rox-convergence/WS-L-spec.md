# WS-L: UI Motion Language + Collaboration (LiveBlocks) + Realtime (LiveKit) — Spec

## 1. Findings

Every claim grounded in `packages/ui/src`, app consumers, and infra files.

### 1.1 What the "motion language" is

There are **two distinct, layered systems** in `packages/ui/src`, both built on `motion@12.38.0` (Framer Motion successor, imported as `motion/react`):

**(A) `motion/` — the app-shell motion kit** (the one apps actually consume today).
- **Tokens** (`packages/ui/src/motion/tokens.ts`): the design-language primitives.
  - `motionDuration` (fast 0.12s / base 0.2s / slow 0.32s) — `tokens.ts:12-16`.
  - `motionSpring` — 9 named spring presets (`soft`, `snappy`, `panel`, `pop`, `sidebarCollapse`, `layout`, `gentle`, `badge`, `bouncy`), each annotated with the originating "case/PR" — `tokens.ts:19-40`.
  - `ease` — two cubic-beziers (`standard`, `emphasized`) — `tokens.ts:43-46`.
  - Shared variant sets: `shellBootVariants` (staggered first-mount shell entrance, `tokens.ts:55-81`), `shakeVariants`/`motionShake` (error shakes, `tokens.ts:88-101`).
  - The file is explicitly an **append-only, cross-area serialization lane**: "later cases add presets here … Never remove or repurpose an existing token" (`tokens.ts:6-9`). Same contract on the barrel (`motion/index.ts:5-7`).
- **Shared transitions / variants** (`packages/ui/src/motion/variants.ts`): `staggerContainer`/`staggerItem` (list entrance, `variants.ts:13-30`), `portBadgeEnter` + `portNumberSpring` + `openButtonPulse` (port-discovery, `variants.ts:38-56`).
- **Primitives** (~45 files in `motion/`): `AnimatedHeight`, `AnimatedNumber`, `AnimatedPresence`, `MotionList`, `MotionPressable`, `MotionRoot`, `MotionToast`, `PopIn`, `Pressable`, `SpinnerRing`, `StreamingShimmer`, `ThinkingDots`, `ToolCardMotion`, `RouteTransition`, etc. (full list in `motion/index.ts:8-53`).
- **The accessibility governor** (`packages/ui/src/motion/useMotionPreference.ts`): the heart of the language. A 3-state preference `"full" | "essential" | "off"` (`useMotionPreference.ts:8`) crossed with a 2-tier classification `"essential" | "decorative"` (`useMotionPreference.ts:14`). Every primitive calls `useShouldAnimate(tier)` (`useMotionPreference.ts:129`) and renders its **final state instantly** when it returns `false`. OS `prefers-reduced-motion` always clamps down to `essential` (`useMotionPreference.ts:60-65`). The kit **must not import any app store** — the host injects its persisted preference once via `setMotionPreferenceSource()` (`useMotionPreference.ts:26-49`), wired through `useSyncExternalStore`. There are non-hook twins (`motionPreference()`, `shouldAnimate()`) for imperative call sites (`useMotionPreference.ts:111-139`). The `useShouldAnimate` signature is marked **FROZEN** (`useMotionPreference.ts:125-128`).

**(B) `motion-frame/` — the "motion-driven design-system" layer** (newer, richer, NOT yet consumed by any app). Self-described as four bottom-up levels (`motion-frame/index.ts:1-15`):
1. **tokens** — semantic "color as law": `STATE_TOKEN` (`transition`/`verified`/`noise` → `--state-*` CSS vars, `motion-frame/tokens.ts:9-18`) + `TYPEFACE_THEMES` (`blueprint`/`brutalist`/`docs`, `tokens.ts:26-28`).
2. **governor** — `MotionFrameProvider` + `useMotionTier`. This is a **second, parallel governor** with its own tier model `"off" | "essential" | "full"` and a `capabilities` object `{ entrance, loop, transition }` (`MotionFrameProvider.tsx:15-42`). It persists to `localStorage` key `rox-motion-tier` (`MotionFrameProvider.tsx:83`) and clamps for reduced-motion (`MotionFrameProvider.tsx:53-58`). Note this is a *different* mechanism than the kit-(A) injected source — it is a React-context provider with its own storage, not the injectable `setMotionPreferenceSource` pattern.
3. **primitives** — `FadeLift`, `PulseDot`, `TraceLine`, `Reveal`, `LoopMarquee` (e.g. `PulseDot` gates loop animation on `capabilities.loop`, renders a static dot otherwise — `primitives/PulseDot/PulseDot.tsx:34-49`).
4. **composites** — `StateTransition`, `SufficiencyPanel`, `EventTrace`, `RuntimeCard`, `ManifestoBlock` — a "concept vocabulary" plus `TypefaceThemeProvider`/`Switcher` and `MotionTierSwitcher`.

**Exports** (`packages/ui/package.json:16-32`): `"./motion"` → `motion/index.ts`, `"./motion-frame"` → `motion-frame/index.ts`. Consumed as `import { … } from "@rox/ui/motion"` / `"@rox/ui/motion-frame"`.

**How components use it:** desktop is the primary consumer — 20+ files import `@rox/ui/motion` (e.g. `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/**`, `.../TabsContent/Terminal/Terminal.tsx`, `ResizablePanel.tsx`). The host source is registered exactly once at boot: `apps/desktop/src/renderer/index.tsx:5,31-34` wires `setMotionPreferenceSource` to `useSettings.getState().animationPreference`.

### 1.2 Maturity / gaps (honest)

- **Web does NOT consume the motion kit at all.** `grep '@rox/ui/motion'` over `apps/web/src` returns zero hits; `apps/web/src/app/providers.tsx` has no `MotionFrameProvider` and no `setMotionPreferenceSource`. This is a direct convergence gap: WS-L must light up the motion language on web so web↔desktop visual parity is even possible.
- **Two governors coexist** (kit-A `useMotionPreference` vs. motion-frame-B `MotionFrameProvider`) with overlapping but non-identical tier vocabularies. `motion-frame` is unconsumed by any app today (`grep motion-frame` over `apps/`/`packages/` outside `ui/src/motion-frame` returns only the package.json export and stale `.next` cache). Not a blocker for WS-L's collab/RTC work, but flagged so we don't deepen the divergence.
- **No LiveBlocks / LiveKit anywhere.** `grep -ri 'liveblocks|livekit'` over the repo (excl. node_modules) = **0 hits**. Fully greenfield — no deps, env keys, packages, or call sites exist.

### 1.3 Existing realtime stack (what LiveBlocks/LiveKit relate to)

- **ElectricSQL** — the live-sync read path: Postgres → Electric → shape subscriptions in clients (org-scoped shape filtering via denormalized `organization_id`, per WS-J `WS-J-spec.md:140`). This is **data sync**, not ephemeral presence/cursors and not media.
- **apps/relay** — a Hono WebSocket **tunnel** (`apps/relay/src/tunnel.ts`), not a CRDT/presence server: it forwards HTTP/WS requests from web→a user's running desktop host (continue-on-mobile, the HYBRID HOST attach path). Deps are tunnel-only (`@hono/node-ws`, `@upstash/redis`, `jose`) — `apps/relay/package.json:1-23`. No collaboration or media primitives.
- **Env wiring** — web validates env in `apps/web/src/env.ts` (T3 `createEnv`); client vars are `NEXT_PUBLIC_*` (`env.ts:24-40`). New public keys for LiveBlocks/LiveKit must be added there + in `experimental__runtimeEnv` (`env.ts:42-55`); server secrets go in the `server:` block.
- **New-package pattern** — root `workspaces: ["packages/*", …]` (`package.json`). `@rox/analytics` is the template for a multi-entry package (`./`, `./client`, `./server`, `./env` conditional exports — `packages/analytics/package.json`).

**Conclusion on relationship:** the three are **orthogonal layers**, not competitors:
- Electric = durable shared state (rows, the WS-J dashboard's persisted content).
- LiveBlocks = **ephemeral collaboration** (presence/cursors/selections + optional CRDT scratch) layered *on top of* the durable Electric data.
- LiveKit = **realtime media** (audio/video/screenshare) — a transport Electric/relay cannot provide.
- relay stays the host-attach tunnel; unaffected.

## 2. Target design

### 2.1 Package topology (two new packages, motion stays in @rox/ui)

```
@rox/ui (existing)
  └─ motion/ + motion-frame/   ← READ-ONLY for WS-L; shared visual language (presence pulses,
                                  cursor easing reuse motionSpring.soft / ease.standard)
@rox/collab  (NEW)             ← LiveBlocks: presence, cursors, ephemeral CRDT
  ├─ env.ts        (LIVEBLOCKS_SECRET_KEY [server], NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY [client])
  ├─ client.tsx    (RoxRoomProvider, useOthers/useMyPresence/useStorage re-exports, typed)
  ├─ types.ts      (Presence, Storage, UserMeta, RoomEvent — typed Liveblocks config)
  ├─ auth.ts       (server: mint room access tokens scoped by org/project membership)
  └─ index.ts
@rox/rtc     (NEW)             ← LiveKit: audio/video/screenshare
  ├─ env.ts        (LIVEKIT_API_KEY + LIVEKIT_API_SECRET [server], NEXT_PUBLIC_LIVEKIT_URL [client])
  ├─ token.ts      (server: AccessToken minting via livekit-server-sdk, org/project grants)
  ├─ client.tsx    (RoxRoomAudioRenderer, useVoiceRoom hook over @livekit/components-react)
  ├─ types.ts
  └─ index.ts
```

Rationale for two packages (not one `@rox/realtime`, not folding into `@rox/ui`): different SDKs, different auth models, different deploy surfaces (LiveKit needs a media server / LiveKit Cloud; LiveBlocks is a hosted CRDT). Keeping them separate keeps `@rox/ui` framework-agnostic and lets web ship collab before voice. The shared **motion language** stays the single source of visual truth — collab cursors and presence dots reuse `motionSpring.soft`/`ease.standard` and the `PulseDot` primitive so realtime UI feels native, not bolted on.

### 2.2 Auth + token flow (sequence)

```
Client (web/desktop)        apps/api (tRPC)            LiveBlocks/LiveKit cloud
      │                          │                              │
      │ collab.authRoom(roomId)  │  verify better-auth session  │
      ├─────────────────────────▶│  + org/project membership    │
      │                          │  (reuse WS-J org scoping)     │
      │                          │  mint scoped token            │
      │◀── { token } ────────────┤                              │
      │ open Room / connect ─────┼─────────────────────────────▶│
      │                          │                              │
      │◀────────── presence / cursors / media (P2P/SFU) ────────│
```

- Room IDs are **org/project-scoped**: `org:{organizationId}:dashboard:{dashboardId}` (collab) and `org:{organizationId}:voice:{channelId}` (rtc). Membership is enforced server-side by reusing the same `organization_id` membership checks WS-J/auth already do (`WS-J-spec.md:140`, `auth.ts:186` pattern) — **no new authz model**.
- Tokens are minted in **apps/api** (server has the secrets; never ship `*_SECRET_KEY` to the client). Clients only ever hold `NEXT_PUBLIC_*` public keys + short-lived minted tokens.

### 2.3 Surfaces (which UI uses them)

- **Collaborative org/project dashboard (WS-J surface)** — LiveBlocks presence (who's viewing), live cursors, and selection highlights over the dashboard board; optional ephemeral CRDT for drag-reorder before it's persisted to Electric/Postgres. Durable content stays in `dashboards`/`dashboard_entries` (WS-J/WS-O); LiveBlocks is the *ephemeral* layer only.
- **Voice/huddle** — LiveKit room attached to a project/dashboard channel: push-to-talk + screenshare of a host pane. Lives next to the dashboard and (P1+) inside a workspace.
- **Avatar stack / "who's here"** — a shared `@rox/ui`-styled presence component driven by `@rox/collab`, reusable on both web and desktop.

### 2.4 Relation to Electric + relay (data-flow)

```
 durable rows ─ Postgres ─▶ Electric shapes ─▶ client cache (rows render first; AGENTS.md cache-first rule)
 ephemeral    ─ LiveBlocks room ─────────────▶ presence/cursors/selection (never persisted unless promoted)
 media        ─ LiveKit SFU ──────────────────▶ audio/video tracks
 host attach  ─ apps/relay WS tunnel ─────────▶ unchanged (continue-on-mobile)
```
No overlap: LiveBlocks/LiveKit never replace Electric or relay; they add the two layers Electric/relay structurally cannot (ephemeral collab + media).

## 3. Phase-2 implementation tasks (TDD, bite-sized)

> Tests use the repo's existing runner (`bun test`, co-located `*.test.ts(x)`). SDK calls are mocked at the package boundary so tests don't hit LiveBlocks/LiveKit cloud.

**T1 — Document + lint-guard the motion language (read-only on `@rox/ui`).**
- Create `packages/ui/src/motion/MOTION-LANGUAGE.md` (the only file WS-L writes inside `@rox/ui`) describing tokens, tiers, the injected-source contract, and the kit-A/motion-frame-B duality + the "append-only" rule.
- Test: a doc-presence assertion is overkill; instead add `packages/ui/src/motion/tokens.contract.test.ts` asserting the public token keys exist and are unchanged (regression guard for the frozen append-only lane).
- Behavior: no runtime change to `@rox/ui`; guards future PRs against accidental token removal.

**T2 — Scaffold `@rox/collab` package + env.**
- Create `packages/collab/package.json` (mirror `@rox/analytics` multi-entry exports: `.`, `./client`, `./auth`, `./env`), `tsconfig.json`, `src/index.ts`, `src/env.ts` (`createEnv`: server `LIVEBLOCKS_SECRET_KEY`, client `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`), `src/types.ts` (typed `Liveblocks` global: `Presence`, `Storage`, `UserMeta`, `RoomEvent`).
- Add deps `@liveblocks/client`, `@liveblocks/react`, `@liveblocks/node`.
- Test `src/env.test.ts`: `createEnv` throws when required vars missing, passes when present (mirror `apps/host-service/.../env.test.ts` style).
- Behavior: package builds + typechecks; no consumer yet.

**T3 — `@rox/collab` client provider + presence hooks.**
- Create `src/client.tsx`: `RoxRoomProvider` wrapping `@liveblocks/react` `RoomProvider`, taking `roomId` + an `authEndpoint` that calls the tRPC mint endpoint (T5). Re-export typed `useOthers`, `useMyPresence`, `useStorage`.
- Test `src/client.test.tsx`: render `RoxRoomProvider` with a mocked Liveblocks client; assert it passes the resolved `roomId` and calls `authEndpoint` once.
- Behavior: a typed, app-agnostic presence surface.

**T4 — `@rox/collab` server auth helper.**
- Create `src/auth.ts`: `authorizeRoom({ userId, organizationId, roomId })` → uses `@liveblocks/node` `Liveblocks.prepareSession` to grant access only if `roomId` matches the user's org membership; returns the session token.
- Test `src/auth.test.ts`: grants for matching org, throws/denies for mismatched org (membership check mocked).
- Behavior: enforces org-scoped rooms server-side.

**T5 — tRPC router: `collab.authRoom` + `rtc.token`.**
- Modify `apps/api` to add a `collab` router (`apps/api/src/.../routers/collab.ts`) exposing `authRoom(roomId)` that resolves the better-auth session, checks org membership, and calls `@rox/collab` `authorizeRoom`. Register it additively in the app router.
- Test: router unit test asserting unauthenticated → throws, wrong-org → throws, member → returns token (session + membership mocked).
- Behavior: clients can mint scoped tokens without ever seeing the secret.

**T6 — Scaffold `@rox/rtc` package + env + token minting.**
- Create `packages/rtc/` mirroring T2 (`.`, `./client`, `./token`, `./env`). Deps: `livekit-server-sdk`, `livekit-client`, `@livekit/components-react`. env: server `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, client `NEXT_PUBLIC_LIVEKIT_URL`.
- `src/token.ts`: `mintVoiceToken({ userId, organizationId, roomName })` via `AccessToken`, grants `roomJoin` for org-scoped `roomName` only.
- Test `src/token.test.ts`: token contains the expected room grant + identity; rejects empty org.
- Behavior: server can mint LiveKit JWTs.

**T7 — `@rox/rtc` client voice hook + audio renderer.**
- `src/client.tsx`: `useVoiceRoom({ roomName })` (connect/disconnect/mute over `livekit-client`), `RoxRoomAudioRenderer` over `@livekit/components-react`.
- Test `src/client.test.tsx`: hook transitions state on mocked connect/disconnect; mute toggles track.
- Add `rtc.token` to the tRPC router from T5.
- Behavior: a reusable voice surface, app-agnostic.

**T8 — Wire env into `apps/web/src/env.ts`.**
- Add `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, `NEXT_PUBLIC_LIVEKIT_URL` to `client:` + `experimental__runtimeEnv`; add `LIVEBLOCKS_SECRET_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` to `server:` (mark `.optional()` initially so missing keys don't break existing builds/preview).
- Test: extend any existing env test, or add `apps/web/src/env.test.ts` asserting optionality.
- Behavior: keys validated, optional during rollout.

**T9 — Presence avatar-stack component (shared visual language).**
- Create `packages/ui/src/components/PresenceStack/PresenceStack.tsx` — a **pure presentational** component (props: `users[]`) that renders avatars + a `PulseDot` "live" indicator, animated with `motionSpring.soft`/`staggerItem`. NO LiveBlocks import (keeps `@rox/ui` clean); the data binding lives in the app. Add barrel + export entry in `packages/ui/package.json`.
- Test `PresenceStack.test.tsx`: renders N avatars, respects `useShouldAnimate` (renders static when motion off).
- Behavior: the reusable "who's here" UI in the shared motion language.

**T10 — Mount collab on the web dashboard surface (integration, gated). [P1 per D3]**
- In `apps/web` dashboard route owned by the web-convergence WS, wrap the board in `RoxRoomProvider` and feed `useOthers()` into `PresenceStack`. Behind a runtime flag (env-optional) so it's inert until keys are set.
- Test: component test with mocked `@rox/collab` returning two others → two avatars render.
- Behavior: live presence on the WS-J dashboard, end to end.

## 4. File ownership (Phase-2, merge isolation)

WS-L **OWNS and may create/modify**:
- `packages/collab/**` (entire new package)
- `packages/rtc/**` (entire new package)
- `packages/ui/src/motion/MOTION-LANGUAGE.md` (new doc) + `packages/ui/src/motion/tokens.contract.test.ts` (new test)
- `packages/ui/src/components/PresenceStack/**` (new component) + its export line in `packages/ui/package.json` (additive only)
- `apps/api/src/.../routers/collab.ts` + `.../routers/rtc.ts` (new router files) — and **additive-only** registration in the api app router
- `apps/web/src/env.ts` (additive keys only)

WS-L **READS but MUST NOT modify** (frozen for this workstream):
- `packages/ui/src/motion/**` (tokens/variants/primitives — append-only lane; WS-L only adds the doc + contract test, touches no existing motion file)
- `packages/ui/src/motion-frame/**`
- `apps/relay/**`, `packages/host-service/**`, ElectricSQL config

WS-L **does NOT touch** (hand off): `packages/db/src/schema/**` (any persisted collab/dashboard tables → **WS-O**), the web/desktop dashboard *route* files themselves except the single mount wrapper in T10 (coordinate with the web-convergence WS that owns `apps/web` dashboard pages).

**Shared-file contention notes:** `apps/web/src/env.ts` and the api app-router registration file are the two cross-workstream touch points — keep edits **purely additive** (new keys / new `.router()` registration lines) to merge cleanly. `packages/ui/package.json` export additions are append-only.

## 5. Dependencies + suggested wave

- **Coordinates with WS-J** (org collaboration / dashboard): WS-J ships the dashboard routers + the persisted `dashboards`/`dashboard_entries` model; WS-L adds the *ephemeral* presence/media layer on top. WS-L's `PresenceStack` mounts on the dashboard surface WS-J defines. No file overlap (WS-J owns routers + schema proposal; WS-L owns collab/rtc packages).
- **Coordinates with WS-O** (schema): only if/when ephemeral collab state is promoted to durable rows. P0/P1 needs **no** schema → WS-L is unblocked early.
- **Coordinates with the web-convergence WS** that owns `apps/web` dashboard pages — for the single T10 mount wrapper.
- **Depends on `@rox/ui` motion** (read-only) — already shipped; no blocker.

**Suggested wave (per D3 — "do BOTH LiveBlocks + LiveKit NOW", see `DECISIONS.md`):**
- **P0** — T1, T2, T3, T6, T9 (motion doc/guard + both `@rox/collab` and `@rox/rtc` scaffolded + shared
  presence component). Fully independent; no other WS needed.
- **P1** — T4, T5, T7, T8, **T10** (server auth for BOTH providers + the `collab.authRoom` and `rtc.token`
  tRPC mints + web env keys + **mounting presence on the dashboard**). D3 pulls T10 into P1 so both
  LiveBlocks and LiveKit are wired end to end in this plan, not deferred. T10 needs the WS-J dashboard
  surface, so sequence WS-L's T10 after WS-J's P1 dashboard router; if the dashboard route isn't ready,
  land the `RoxRoomProvider` + `PresenceStack` wrapper behind the existing experimental-features gate so it
  is inert until the surface exists. Routers live in `packages/trpc/src/router/{collab,rtc}/**`, registered
  additively in `packages/trpc/src/root.ts` (order after WS-E and WS-J).

## 6. Target PR

- Branch: `feat/ws-l-collab-rtc-motion-language`
- PR title: `feat(collab,rtc): add @rox/collab (LiveBlocks presence) + @rox/rtc (LiveKit voice) on the shared @rox/ui motion language`

## Decision updates (resolved forks — see `DECISIONS.md`)

- **D3 (owner): do BOTH LiveBlocks AND LiveKit NOW.** LiveBlocks (collaborative editing / shared cursors /
  presence) and LiveKit (voice/calls) ship in this plan, end to end — they move from **P2 to P1**. T10
  (mount presence on the web dashboard) is now a **P1** task, not P2, so both providers are wired through to
  the collaborative dashboard surface (WS-J) in this plan. Tasks already cover both providers end to end
  (T2–T5 collab, T6–T7 rtc, T8 env, T9 presence UI, T10 dashboard mount). Reuse the existing
  experimental-features provider registry + env-key names (`LIVEBLOCKS_SECRET_KEY`,
  `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`)
  per the hardening review (a)(1) — do not invent a parallel flag. Routers live in
  `packages/trpc/src/router/{collab,rtc}/**` (corrected from `apps/api`), registered additively in
  `packages/trpc/src/root.ts` after WS-E and WS-J.

## 7. Hardening review

Read-only verification pass against the live tree (cwd repo root). Each item cites `file:line` evidence.

### (a) Factual corrections

1. **WRONG — "No LiveBlocks / LiveKit anywhere … = 0 hits. Fully greenfield — no deps, env keys, packages, or call sites exist" (§1.2 line 36).** This is the most load-bearing error in the spec. Both providers are already first-class in the codebase:
   - `packages/shared/src/experimental-features/index.ts:114-128` defines `LIVEBLOCKS_PROVIDER` and `LIVEKIT_PROVIDER` (`kind: "provider"`, `required: true`, with `configurationHint`s), and an entire `collaboration` feature category (`index.ts:453-560+`: `collaboration.presence`, `.editor`, `.threadsAsObjects`, `.inlineComments`, `.taskBoard`, `.canvas`, `.aiToolbar`, `.mentionsNotifications`, `.durableSnapshots`, `.agentParticipant`) whose `dependencies` reference `LIVEBLOCKS_PROVIDER`/`LIVEKIT_PROVIDER`.
   - The **exact env var keys** the spec proposes already exist verbatim: `apps/desktop/src/lib/trpc/routers/settings/index.ts:141-143` maps `liveblocks → ["LIVEBLOCKS_SECRET_KEY","NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY"]` and `livekit → ["LIVEKIT_API_KEY","LIVEKIT_API_SECRET","NEXT_PUBLIC_LIVEKIT_URL"]`, with a runtime `hasConfiguredEnvKeyGroup()` check (`index.ts:147`).
   - There is also a settings-search surface (`apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts`) and an experimental catalog UI (`.../ExperimentalFeatureCatalog/ExperimentalFeatureCatalog.tsx`), plus a test (`packages/shared/src/experimental-features/experimental-features.test.ts`).
   - **Impact:** "greenfield" is false; this is a *partially-scaffolded* feature with an established provider/env-key contract and a gating UI. **WS-L MUST reuse these exact key names and reconcile with the experimental-features gating model** rather than inventing a parallel flag (T8/T10 "runtime flag" must be the existing experimental-feature gate, not a new one). This is a net positive — the naming the spec independently chose already matches — but the §1.2 narrative and the "Behind a runtime flag (env-optional)" wording in T10 are factually wrong and must be rewritten.

2. **WRONG (mislocated routers) — tRPC routers do NOT live in `apps/api`.** §1.3 line 42 ("web validates env in `apps/web/src/env.ts`") is correct, but T5 (line 134-135) and §4 (line 173) repeatedly say to "Modify `apps/api` to add a `collab` router (`apps/api/src/.../routers/collab.ts`)" and "`apps/api/src/.../routers/rtc.ts`". Verified: the entire tRPC router surface lives in **`packages/trpc/src/router/<name>/`** and is composed in **`packages/trpc/src/root.ts`** (`appRouter = createTRPCRouter({...})`, imports `root.ts:1-43`, registrations `root.ts:44-83`). `apps/api` only exposes the HTTP handler at `apps/api/src/app/api/trpc/[trpc]/route.ts`. **Correction:** new routers must be `packages/trpc/src/router/collab/{index.ts,collab.ts,schema.ts,collab.test.ts}` and `.../router/rtc/**`, registered additively in `packages/trpc/src/root.ts`. The §4 ownership entry "`apps/api/src/.../routers/collab.ts`" is therefore wrong and `packages/trpc/src/root.ts` is an undisclosed shared touch-point (see (c)).

3. **MISLEADING — `@rox/collab` `./env` should NOT "mirror @rox/analytics" with `createEnv`.** T2 (line 119) says "Create `src/env.ts` (`createEnv`: server `LIVEBLOCKS_SECRET_KEY`…)". But `@rox/analytics/src/env.ts:1-39` is *deliberately* `createEnv`-free — a plain `read(key)` helper "Kept dependency-light (no `@t3-oss/env-core`) so this package can be imported from both browser and server bundles." Packages that DO use `createEnv` are `packages/{auth,db,host-service,trpc}/src/env.ts`. **Correction:** decide explicitly — if `@rox/collab`/`@rox/rtc` are imported from both client and server bundles (they are: client.tsx + auth.ts/token.ts), follow the **analytics dependency-light `read()` pattern**, not `createEnv`. The host app (`apps/web/src/env.ts`) remains the validating authority (T8). The spec conflates two opposing patterns.

4. **IMPRECISE (under-stated) — an org-scoped `voice` schema + router already exist.** §1.1/§2.3 treat LiveKit voice as wholly new. There is already `packages/db/src/schema/voice.ts` (`voice_transcriptions`, "Per-user, org-scoped like the journal/memory tables") and a registered `voiceRouter` (`packages/trpc/src/root.ts:38,80`). It is voice *dictation* (Whisper/R1), not realtime media, so it does not block LiveKit — but the spec should name it to avoid a naming collision (`rtc` vs `voice`) and to clarify scope. **Add a one-line disambiguation.**

5. **MINOR (verified-correct, noted for completeness) — `apps/relay` is `@rox/relay`, a host tunnel, exactly as described.** `apps/relay/src/tunnel.ts:51` (`private readonly tunnels = new Map<string, TunnelState>()`), deps `@hono/node-ws`/`@upstash/redis`/`jose` (`apps/relay/package.json:11-20`). §1.3 line 41 is accurate (deps list is a superset — also `@hono/node-server`, `@trpc/client`, `lru-cache`, `superjson`, `@sentry/node` — but the "tunnel-only" characterization holds). No correction needed.

**Verified-correct claims (spot-checked, no change):** motion `tokens.ts` (9 springs + durations + ease, append-only header `tokens.ts:1-9`) ✓; `useMotionPreference.ts` 3-state pref (`:8`), 2-tier (`:14`), reduced-motion clamp (`:60-62`), FROZEN `useShouldAnimate` (`:126-129`) ✓; desktop boot wiring `setMotionPreferenceSource` from `useSettings.animationPreference` (`apps/desktop/src/renderer/index.tsx:5,31-33`) ✓; `@rox/ui` exports `./motion` + `./motion-frame` (`packages/ui/package.json:30-31`) ✓; motion-frame second governor tier `"off"|"essential"|"full"` + capabilities `{entrance,loop,transition}` + `localStorage "rox-motion-tier"` (`MotionFrameProvider.tsx:15,19-24,39-41,83`) ✓; `PulseDot` gates on `capabilities.loop` (`PulseDot.tsx:25,34`) ✓; `STATE_TOKEN`/`TYPEFACE_THEMES` (`motion-frame/tokens.ts:9-18,26-28`) ✓; web does NOT consume `@rox/ui/motion` (grep of `apps/web/src` = 0) ✓; `@rox/analytics` multi-entry export shape `./client`/`./server`/`./env` (`packages/analytics/package.json:6-31`) ✓; `apps/web/src/env.ts` is T3 `createEnv` with `client:`/`server:`/`experimental__runtimeEnv` blocks (`env.ts:5-56`) ✓.

### (b) Brief questions not fully answered

1. **Experimental-features integration not addressed.** The brief asks "what each app/package must change end to end". The spec never mentions the existing `packages/shared/src/experimental-features` registry or the desktop gating UI, so the end-to-end plan is incomplete: who flips a `collaboration.presence` feature from `implementationStatus: "planned"` to live? How does `PresenceStack` (T9) tie to `hasConfiguredEnvKeyGroup`? **Unanswered.**
2. **Desktop consumption of collab/rtc.** The brief explicitly lists "consumers in apps/desktop + apps/web". The plan mounts collab only on the **web** dashboard (T10) and says nothing concrete about desktop, despite the experimental-features UI living in desktop. Desktop is the *primary* motion consumer (20+ imports) — the spec leaves its collab/voice surface unspecified.
3. **LiveKit deploy/runtime target.** §2.1 mentions "LiveKit needs a media server / LiveKit Cloud" but no decision (self-host SFU vs LiveKit Cloud), no cost/infra note, and no `NEXT_PUBLIC_LIVEKIT_URL` source-of-truth. **Unanswered.**
4. **CRDT-to-Electric promotion mechanism.** §2.3/§2.4 repeatedly say ephemeral state may be "promoted to Electric/Postgres" but never specify the write path (who calls `dashboard.upsertEntry`, debounce, conflict policy). Hand-waved.
5. **`motion-frame` (B) duality resolution.** §1.2 flags two governors but the plan's T1 only *documents* the duality; the brief asks to "explain … how components use it" — the spec doesn't decide whether collab UI should use governor-A (`useShouldAnimate`) or governor-B (`useMotionTier`). T9 picks A implicitly (`useShouldAnimate`), but `PulseDot` (recommended in §2.1/T9) lives in **motion-frame (B)** and is gated by `useMotionTier`, not `useShouldAnimate` — a latent contradiction (see (a) note: T9 says "renders a `PulseDot` … respects `useShouldAnimate`" but `PulseDot` actually respects `capabilities.loop` from the B governor). **Partially answered / internally inconsistent.**

### (c) Merge-safety / file-ownership overlap check

Cross-checked WS-L's claimed files against all siblings (WS-A…WS-O). Ownership model confirmed: schema = WS-O (all `packages/db/src/schema/**`), except `economy.ts` = WS-E.

- **CLEAN (no overlap):** `packages/collab/**`, `packages/rtc/**`, `packages/ui/src/components/PresenceStack/**`, `packages/ui/src/motion/MOTION-LANGUAGE.md`, `packages/ui/src/motion/tokens.contract.test.ts`, `apps/web/src/env.ts` — no sibling spec claims any of these. WS-L correctly hands all schema to WS-O (§4 line 181). ✓
- **OVERLAP / FLAG — `packages/trpc/src/root.ts` (router registration).** WS-L's real registration target (mislocated as `apps/api` in (a)(2)) is `root.ts`, which is an **already-contended shared file**: claimed for additive edits by **WS-J** (`WS-J-spec.md:158,180,197` — registers `skillLibrary`/`dashboard`/`mcp`), **WS-E** (`WS-E-spec.md:166,211` — registers `economy`), and **WS-F** (admin router edits in the same file region). WS-O explicitly disclaims it (`WS-O-spec.md:150`). **Risk: real but low** — all edits are additive import + one registration line in the `root.ts:1-43` / `:44-83` regions. **Required fix:** WS-L §4 must (1) relocate routers to `packages/trpc/src/router/{collab,rtc}/**`, (2) add `packages/trpc/src/root.ts` to its "additive shared touch-point" list, and (3) coordinate merge order with WS-J/WS-E/WS-F (recommend WS-L registers last; conflicts are trivial 2-line rebases).
- **OVERLAP / FLAG — experimental-features gating ownership.** `packages/shared/src/experimental-features/index.ts` (the collab/rtc provider registry) and `apps/desktop/src/lib/trpc/routers/settings/index.ts` (env-key groups) are pre-existing and **not in WS-L's ownership list at all**. If WS-L wires its packages to the real feature gate (it should, per (a)(1)), it will need additive edits there. **Currently unowned by any spec for the collab path** — flag for assignment. Low risk (additive) but undeclared.
- **NO overlap on `apps/web/src/env.ts`:** no sibling spec edits this file (only WS-B/WS-H *read* `apps/web` routes). Additive keys are safe.

### (d) Confidence per major claim

| Claim | Verdict | Confidence |
|---|---|---|
| Motion language = governor-A kit (`motion/`) + governor-B (`motion-frame/`), tokens/tiers/injected-source as described | Verified accurate | **High** |
| Web does not consume motion kit (convergence gap) | Verified (grep=0) | **High** |
| "Fully greenfield, 0 LiveBlocks/LiveKit hits, no env keys" | **FALSE** — provider registry + exact env keys + gating UI already exist | **High** (disproven) |
| Two new packages `@rox/collab` + `@rox/rtc` topology | Sound design; not yet reconciled with experimental-features gate | **Medium** |
| Routers in `apps/api/src/.../routers/` | **WRONG** — they live in `packages/trpc/src/router/` + `root.ts` | **High** (disproven) |
| `./env` mirrors `@rox/analytics` `createEnv` | **Mixed** — analytics is intentionally `createEnv`-free | **High** (correction) |
| Electric / relay / LiveBlocks / LiveKit are orthogonal layers | Verified (relay = tunnel, Electric = sync) | **High** |
| Org-scoped token mint reusing existing auth/membership | Plausible, pattern exists (`requireActiveOrgMembership`), not yet verified end-to-end against an auth call site | **Medium** |
| Ownership of WS-L's NEW files is uncontested | Verified clean except `root.ts` (shared) + experimental-features (undeclared) | **High** |
| `PresenceStack` reuses `PulseDot` + `useShouldAnimate` | **Internally inconsistent** — `PulseDot` is governed by `useMotionTier` (B), not `useShouldAnimate` (A) | **Medium** (flagged) |
