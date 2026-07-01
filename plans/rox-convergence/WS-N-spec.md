# WS-N — Infra polish: aerials, network-filter flag, branch browser — Spec

> Workstream owner: desktop "infra polish" lane. Read-only discovery complete; this spec is implementation-ready for Phase 2.
> Three independent deliverables that share almost no files, so they can land as one PR or be split into three sub-commits.

---

## 1. Findings (each question answered with file:line evidence)

### 1A. AERIALS — wallpaper/background-video system today

**The owner does NOT want to rip Apple Aerials mp4s.** Good news: the existing wallpaper system was already designed for exactly this — a manifest-driven pack that supports remote URLs and a future image/video pack, shipping **zero binary assets today**.

- Wallpaper content is a typed manifest, not bundled files: `packages/shared/src/appearance/wallpapers.ts:15` (`WALLPAPERS: readonly Wallpaper[]`), 7 entries, all `kind: "gradient"` (zero-asset animated mesh gradients).
- The source union already supports remote assets: `packages/shared/src/appearance/types.ts:16-19` — `WallpaperSource = { kind:"bundled"; path } | { kind:"remote"; url } | { kind:"gradient"; colors }`. The header comment (`wallpapers.ts:8-11`) explicitly says image wallpapers (`bundled`/`remote`) are added when a licensed pack is finalized and "the manifest shape already supports them, so consumers won't change."
- There is **no `kind:"video"` yet** — `WallpaperSource` has only gradient/bundled/remote (all treated as static `background`/`<img>`). `Wallpaper.scene` (`types.ts:29`) is gradient-only atmosphere. So aerial *video* wallpapers need a new `WallpaperSource` variant + a renderer that mounts a muted looping `<video>`. This is the one real code gap for aerials.
- Persistence: `AppearanceSettings` (`packages/shared/src/appearance/types.ts:67-90`) and the desktop mirror `AppearanceState` (`apps/desktop/src/main/lib/app-state/schemas.ts:27-40`) carry `wallpaperId / wallpaperAutoRotate / wallpaperRotateSeconds`. Live store: `apps/desktop/src/renderer/stores/wallpaper/store.ts` (rotation timer is module-scoped, survives remounts; `WALLPAPERS.length <= 1` guard at `store.ts:66`).
- Selection UI: `apps/desktop/src/renderer/routes/_authenticated/settings/appearance/components/AppearanceSettings/components/WallpaperSection/WallpaperSection.tsx` — preview grid (`:137`), preview render uses `previewBackground(wallpaper.source)` (`:157`), so a new video source needs a `previewBackground` branch (poster frame) + a grid thumbnail.
- Maturity: gradient pack is **shipped/working**; video/remote pack is **planned, never built**. No download/cache infra exists for remote video.

**Deliverable: curated aerial video catalog (researched live).** ~30 free / royalty-free / CC0 aerial-style ambient clips for desktop wallpaper. Sources verified live via Exa web search 2026-06-20.

**License key (read before shipping):**
- **Pixabay Content License** — free for commercial + personal use, **no attribution required**, no redistribution as-is. Effectively CC0-like. Safe.
- **Pexels License** — free commercial/personal, **no attribution required**, may not be sold unmodified. Some older Pexels clips are explicitly tagged "Free to use (CC0)". Safe.
- **Mixkit Free Stock Video License** — free for commercial/personal use, **no attribution**; cannot redistribute the clip standalone (fine for embedding as wallpaper). Safe.
- **Coverr License** — royalty-free, **no attribution, no watermark**, commercial OK. Safe. (Note: Coverr now mixes AI-generated clips — pick the human-shot ones for "real aerial" feel.)
- **Internet Archive** — license is **per-item**; only use items explicitly marked Public Domain / CC0 / CC-BY. Many "nature film" items are still Copyrighted (e.g. `archive.org/details/castiacr_000004` is "Rights are owned by..." — DO NOT USE). Verify each.
- **Dareful** — CC-BY 4.0 — usable but **requires attribution**; prefer the no-attribution sources above for a polished product. Listed for completeness only.

> Recommendation for Phase 2: download the chosen clips, transcode to web-friendly H.264/HEVC + (optionally) a short 10–20s seamless loop, host them in the private S3 artifact store (`s3://agent-artifacts/media/rox-aerials/...`) or bundle a small subset, and reference via `kind:"remote"` (S3 URL) or a new `kind:"video"` bundled variant. Keep an attribution/license manifest (`credit` field on `Wallpaper`, `types.ts:47`) even when not strictly required, to be safe.

#### Curated catalog (~30) — title · source URL · license · resolution

| # | Title | Source URL | License | Max res |
|---|-------|-----------|---------|---------|
| 1 | Drone Pullback Over Lake | https://mixkit.co/free-stock-video/drone-pullback-over-lake-101513/ | Mixkit Free | 4K (4096×2160) |
| 2 | Drone Shot Over Hills and Dock | https://mixkit.co/free-stock-video/drone-shot-over-hills-and-dock-101506/ | Mixkit Free | 4K |
| 3 | Aerial Zoom Over Cloudy Hills | https://mixkit.co/free-stock-video/aerial-zoom-over-cloudy-hills-101508/ | Mixkit Free | 4K |
| 4 | Majestic Hills and Sky Reflections | https://mixkit.co/free-stock-video/majestic-hills-and-sky-reflections-101510/ | Mixkit Free | 4K |
| 5 | Dynamic Drone Ride Over an Isthmus | https://mixkit.co/free-stock-video/dynamic-drone-ride-over-an-isthmus-44401/ | Mixkit Free | 1080p |
| 6 | Drone, Nature, Landscape | https://pixabay.com/videos/drone-nature-landscape-air-photo-23334/ | Pixabay Content License | 1080p |
| 7 | Mountains, Peaks, Clouds (sunset sky) | https://pixabay.com/videos/mountains-peaks-clouds-sunset-sky-347325/ | Pixabay Content License | 4K (3840×2160) |
| 8 | Mountains, Clouds, Mountain Landscape | https://pixabay.com/videos/mountains-clouds-mountain-landscape-138276/ | Pixabay Content License | 4K |
| 9 | Aerial View, Cloudscape, Flying | https://pixabay.com/videos/aerial-view-cloudscape-flying-110911/ | Pixabay Content License | 4K |
| 10 | Sunrise, Drone Footage, Cinematic Nature | https://pixabay.com/videos/sunrise-drone-footage-286424/ | Pixabay Content License | 1080×1920 (vertical) |
| 11 | Africa, South Africa, Nature (Cape Town drone) | https://pixabay.com/videos/africa-south-africa-nature-capetown-302173/ | Pixabay Content License | 4K |
| 12 | Aerial View, Beach, Blue Water (Porto Santo) | https://pixabay.com/videos/aerial-view-beach-blue-water-carbon-344382/ | Pixabay Content License | 4K |
| 13 | Mountain Valley Landscape | https://coverr.co/videos/mountain-valley-landscape-mni5sqk3vo | Coverr (no attribution) | 4K-ready |
| 14 | Lush Green Mountain Pathway | https://coverr.co/videos/lush-green-mountain-pathway | Coverr (no attribution) | 16:9 |
| 15 | A View of Nature (aerial trees) | https://coverr.co/videos/a-view-of-nature-sjf7wllzip | Coverr (no attribution) | 16:9 |
| 16 | Coverr — Aerial Videography collection (curate human-shot) | https://coverr.co/stock-video-footage/aerial | Coverr (no attribution) | 4K |
| 17 | Coverr — Drone Footage collection (curate human-shot) | https://coverr.co/stock-video-footage/drone-footage | Coverr (no attribution) | 4K |
| 18 | Coverr — Natural Landscape collection (curate human-shot) | https://coverr.co/stock-video-footage/natural-landscape | Coverr (no attribution) | 4K |
| 19 | Coverr — Loopable backgrounds collection | https://coverr.co/stock-video-footage/loopable | Coverr (no attribution) | 4K |
| 20 | Drone Footage of a Verdant Countryside (sunrise) | https://www.pexels.com/video/drone-footage-of-a-verdant-countryside-10433807/ | Pexels License | 4K |
| 21 | Serene Aerial View of Lush Forest with Lake | https://www.pexels.com/video/serene-aerial-view-of-lush-forest-with-lake-30924280/ | Pexels License | 4K |
| 22 | Aerial Drone Sunset Over Serene Lake | https://www.pexels.com/video/aerial-drone-sunset-over-serene-lake-31646048/ | Pexels License | 4K |
| 23 | Aerial Video of Coastline (fog-covered isle) | https://www.pexels.com/video/aerial-video-of-coastline-854752/ | Pexels — **CC0** (tagged) | 4K |
| 24 | Tranquil Aerial View of Evening Ocean Waves | https://www.pexels.com/video/tranquil-aerial-view-of-evening-ocean-waves-30322747/ | Pexels License | 4K |
| 25 | Drone View of Serene Ocean Coastline at Sunset | https://www.pexels.com/video/drone-view-of-serene-ocean-coastline-at-sunset-37534879/ | Pexels License | 4K |
| 26 | Cox's Bazar Ocean Waves Aerial View 4K | https://www.pexels.com/video/cox-s-bazar-ocean-waves-aerial-view-4k-36141533/ | Pexels License | 4K |
| 27 | Aerial Sunrise over California Coastal Bay | https://www.pexels.com/video/aerial-sunrise-over-california-coastal-bay-36316920/ | Pexels License | 4K |
| 28 | Serene Aerial View of Tranquil Beach (twilight) | https://www.pexels.com/video/serene-aerial-view-of-tranquil-beach-34627920/ | Pexels License | 4K |
| 29 | Drone Footage of a Desert | https://www.pexels.com/video/drone-footage-of-a-desert-7895580/ | Pexels — "Free to use" | 4K |
| 30 | Expansive Aerial View of Desert Dunes in Peru (Huacachina) | https://www.pexels.com/video/expansive-aerial-view-of-desert-dunes-in-peru-35296751/ | Pexels License | 4K |
| 31 | Aerial Footage of a City (skyline sunset) | https://www.pexels.com/video/aerial-footage-of-a-city-5879459/ | Pexels License | 4K |
| 32 | Aerial Cape Town Cityscape at Sunset | https://www.pexels.com/video/city-landscape-mountains-sunset-4873247/ | Pexels License | 4K |

> Notes: entries 16–19 are **collection landing pages** — Phase 2 picks 3–5 human-shot clips from each (the AI-generated ones are clearly labeled; skip them for an authentic Apple-Aerials feel). That yields well over 30 final clips while every named license is no-attribution. Internet Archive deliberately excluded from the shortlist because the surfaced nature-film items are still copyrighted (`archive.org/details/castiacr_000004` = "Rights are owned by Deborah Anderson-Phillips" — unusable); only add IA items individually verified as PD/CC0. Dareful (`https://dareful.com/ocean-coast-aerial/`) is CC-BY — usable with credit, kept as a backup, not in the core 30.

### 1B. NETWORK-FILTER FLAG — the automation/developer-id gating pattern

**Question: where is "an automation flag gated by a developer-id", and how to add an analogous network-filter flag.**

Honest finding: **there is no in-code "developer-id" gate today.** This is confirmed by the sibling spec WS-F (`plans/rox-convergence/WS-F-spec.md:18`): *"the owner's later developer-id gating (automation flag + network-filter flag) has no storage or check today"* and again at `WS-F-spec.md:113`. A repo-wide grep for `isDeveloper|developerId|developer_id|DEVELOPER_USER_IDS` over `apps/desktop` + `packages/shared` returns only the dev login constants (`packages/shared/src/dev-credentials.ts:1-3`, the `admin@local.test` seed user) and Apple "Developer ID" code-signing strings (`apps/desktop/src/main/lib/auto-updater.ts:88-118`) — nothing that gates a feature by a developer/owner identity.

What **does** exist — the real gating mechanism the owner is describing in spirit:

- **PostHog feature flags**, centrally defined in `packages/shared/src/constants.ts:105-132` (`FEATURE_FLAGS` const). Current keys: `ELECTRIC_TASKS_ACCESS`, `WEB_AGENTS_UI_ACCESS`, `GITHUB_INTEGRATION_ACCESS`, `CLOUD_ACCESS`, `DISABLE_REMOTE_AGENT`, `SLACK_MCP_V2`, `RELAY_URL_OVERRIDE`.
- **The closest thing to an "automation flag"** is the remote-agent/automation command watcher gated by `DISABLE_REMOTE_AGENT`: `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/useCommandWatcher.ts:37-40` — `useFeatureFlagEnabled(FEATURE_FLAGS.DISABLE_REMOTE_AGENT)` → `shouldWatch` (`:40`). This is the desktop automation/remote-command surface, flag-gated.
- Flags are evaluated per-user via `useFeatureFlagEnabled` (renderer, posthog-js/react) — e.g. `.../settings/project/$projectId/cloud/page.tsx:13` (`CLOUD_ACCESS`) — or server-side with `posthog.getFeatureFlag(flag, userId)` (e.g. `apps/api/.../run-agent.ts:558` for `SLACK_MCP_V2`, "evaluated against the linking user's id … piggybacks on the existing All Access cohort", `constants.ts:116-121`). So today "gated by a developer-id" = a PostHog flag whose rollout cohort is the owner's user id, applied server-side cohorts — **not** an in-code allowlist.
- PostHog init: `apps/desktop/src/renderer/lib/posthog.ts:8-35` (`person_profiles: "identified_only"`, bootstrap distinctID = deviceId).
- There is a **DB-override layer being added by WS-O/WS-F**: a `user_feature_flags` table + `resolveUserFlag(userId,key)` / `upsertUserFlagOverride(...)` helpers (`WS-F-spec.md:127-138, 217-218`). Override-first, PostHog-fallback resolution (`WS-F-spec.md:100-113`). **New flag keys (automation, network-filter) are key-agnostic to that table — no schema change** (`WS-F-spec.md:113`).
- There is also a gradient of "experimental features" with a different gate (`ExperimentalFeatureGate`, `apps/desktop/src/renderer/components/ExperimentalFeatureGate/ExperimentalFeatureGate.tsx`; catalog `packages/shared/src/experimental-features/index.ts`) — that is its own kill-switch/dependency system, not user-id gating. Not the right home for the network-filter flag.
- There is a product plan for the network filter itself: `plans/2026-06-18-managed-nextdns-profile.md` — a NextDNS managed-profile MVP, explicitly "DNS Settings, not a full Network Filter" with the full Network Filter as a "later hard-enforcement phase" (`:14-16`, Option C at `:143`). The **flag** WS-N adds is the gate that exposes that future UI.

**Spec — how to add the `NETWORK_FILTER` flag, analogous to the automation gate:**
1. **Storage / key (coordinate with WS-O/WS-F).** Add `NETWORK_FILTER: "network-filter"` (and `AUTOMATION_ACCESS: "automation-access"` if the owner wants the automation flag promoted from cohort-only to an explicit key) to `FEATURE_FLAGS` in `packages/shared/src/constants.ts`. No new table: the `user_feature_flags` override table (WS-O) accepts any `FEATURE_FLAGS` value, so the owner's "developer-id" gating = an admin force-on row for the owner's user id (`WS-F` admin UI, `setUserFlag`), with PostHog cohort fallback.
2. **Gate (mirror `useCommandWatcher`).** In the renderer, gate the network-filter surface with `useFeatureFlagEnabled(FEATURE_FLAGS.NETWORK_FILTER)` exactly as `useCommandWatcher.ts:37` does. For any main-process/server path, evaluate via `getFeatureFlagPayload`/`getFeatureFlag` like `apps/desktop/src/main/lib/relay-url/relay-url.ts:24`.
3. **"Developer-id" semantics.** Until the owner adds a literal developer-id check, "gated by developer-id" is achieved by: PostHog flag with rollout cohort = owner only, OR an admin DB override row for the owner. If a true in-code developer gate is wanted later, WS-F flags it as a `developerProcedure` vs `adminProcedure` decision (`WS-F-spec.md:214`) — WS-N should NOT invent its own parallel developer-id mechanism; it consumes whatever WS-F/WS-O land.
4. **UI.** Add a Settings entry (Network Filter / Managed DNS) wrapped in the flag check, rendering nothing when off — same pattern as the cloud settings pages (`.../cloud/page.tsx:13`). The actual NextDNS wiring is the separate plan (`2026-06-18-managed-nextdns-profile.md`); WS-N delivers only the flag + the gated empty shell so the surface can be toggled per-user.

### 1C. BRANCH BROWSER — what it is, where, how the user views it

**The "branch browser" is the in-app web browser pane that lives inside a workspace.** In Rox a "workspace" is an isolated git **worktree/branch** (per AGENTS.md: "isolated git-worktree copy of this repo"), so the browser pane is effectively a browser scoped to / running alongside a branch — hence "branch browser."

- It is a **pane type** rendered inside a workspace tab's mosaic layout: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/BrowserPane.tsx`. It mounts a persistent Electron `<webview>` via `usePersistentWebview` (`BrowserPane.tsx:55-66`, hook at `.../BrowserPane/hooks/usePersistentWebview/usePersistentWebview.ts`).
- **Toolbar / how the user drives it:** address bar + back/forward/reload + URL autocomplete (`.../BrowserToolbar/...`, `useUrlAutocomplete.ts`), an overflow menu (`BrowserOverflowMenu.tsx`), and a DevTools button (`BrowserPane.tsx:104-117`, `electronTrpc.browser.openDevTools`). Empty state shows a globe + "Enter a URL above, or instruct an agent to navigate" (`BrowserPane.tsx:132-150`) — i.e. **agents can also drive the browser**.
- **History ("browser history") backing store:** a local SQLite table, exposed by a tRPC router `apps/desktop/src/lib/trpc/routers/browser-history/index.ts` — `getAll` (last 500, `:9-16`), `search` (`:18-34`), `upsert` (visit count + favicon, `:36-64`), `clear` (`:66-68`). It is consumed for URL autocomplete (`useUrlAutocomplete.ts:22`), populated on navigation (`usePersistentWebview.ts:115`), and cleared from the overflow menu (`BrowserOverflowMenu.tsx:35`).
- **Two implementations exist (v1 and v2):** the v1 screen path above, plus a v2 dashboard pane registry copy under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/` (e.g. `browserRuntimeRegistry.ts:255` upserts history; its own `BrowserToolbar`/`BrowserOverflowMenu`). Per the convergence master plan, v2 is the target surface — any branch-browser polish should land in **both** or be consolidated.
- **Per-branch nuance / current gap:** `browserHistory` is global (one local-db table, no `workspaceId`/branch column — see schema usage in `browser-history/index.ts`). So today the "branch browser" is per-branch in *placement* (a pane inside a branch workspace) but its **history is shared across all branches**. If the owner means a literally per-branch history/session, that is a real gap: it needs a `workspaceId` column on `browserHistory` and scoped queries.
- Tab/pane persistence: pane + browser state lives in `apps/desktop/src/renderer/stores/tabs/store.ts` / `types.ts` (`pane.browser.history`, `historyIndex`, `currentUrl`, used in `BrowserPane.tsx:44-49`).

**WS-N branch-browser scope — EXPANDED per D4 (see `DECISIONS.md`).** The owner upgraded the
branch browser from "per-branch history column" into a full **import → local-7-day → server-upload →
purge** pipeline with mandatory consent. The original per-branch scoping question (nullable column vs
composite unique) is **superseded**: history is per-workspace **both** locally and server-side. The
full feature spec lives in §1D / §2D / §3 (branch-browser track) / §4 below. Read those, not this line.

### 1D. BROWSER-DATA IMPORT / SYNC / UPLOAD / PURGE — the D4 feature (grounded in live code)

> Owner decision D4 (`DECISIONS.md`): import the user's REAL browser history (Chrome/Arc/Safari/…)
> into the in-app browser, keep it locally ~7 days, upload to OUR server every 3–7 days, then purge it
> locally; long-term we keep our OWN cleaned, **per-workspace** history server-side. This requires an
> explicit **consent + privacy/opt-in flow** because we upload a user's browsing data to our servers.

**What exists today (read-only verification, file:line):**

- **Local store is global + local-only.** `browser_history` (`packages/local-db/src/schema/schema.ts:448-466`):
  PK `id` (uuid `$defaultFn`), `url text .notNull().unique()` (`:454` — the dedup/conflict key), `title`,
  `favicon_url`, `last_visited_at`, `visit_count`. **No `workspace_id`, no `user_id`, no `source`, no
  consent column.** So today the table cannot distinguish Rox-internal browsing from imported OS history,
  cannot scope by branch, and would collapse same-URL visits across branches via the `url` unique +
  `onConflictDoUpdate` (`browser-history/index.ts:55`).
- **History router** (Electron IPC, `publicProcedure`): `apps/desktop/src/lib/trpc/routers/browser-history/index.ts`
  — `getAll` (limit 500, `:9-16`), `search` (limit 10, `:18-34`), `upsert` (`onConflictDoUpdate` on `url`, `:36-64`),
  `clear` (deletes all, `:66-68`). Autocomplete uses `getAll` (`useUrlAutocomplete.ts:22-25`), not `search`.
- **Webview / session.** Both panes mount an Electron `<webview partition="persist:rox">` (v1
  `usePersistentWebview.ts:209`, v2 `browserRuntimeRegistry.ts:192`); history upsert fires on
  `did-stop-loading` (v1 ~`:263-269`, v2 ~`:254-260`) and on favicon update. Cookies/cache/storage live in
  the single shared `persist:rox` session — there is already a purge primitive for THAT web data:
  `browser.clearBrowsingData({type})` → `session.fromPartition("persist:rox")` (`browser/browser.ts:240-264`).
- **OS-browser file locations are partly solved already.** `getChromiumUserDataDirs()`
  (`apps/desktop/src/main/lib/extensions/index.ts:41-79`) enumerates Chrome / Chrome Beta / Canary /
  Chromium / Brave / **Arc** user-data dirs per OS (today used only to load extensions). Chromium history is
  the `History` SQLite file under `<userdata>/<Profile>/History`. Safari history is `~/Library/Safari/History.db`
  and needs **Full Disk Access**, which is already probed at `permissions/full-disk-access.ts:5-10`.
  **No history-import code exists today** (no `places.sqlite`/`History.db` parsing anywhere).
- **Desktop → OUR cloud API.** The renderer calls our API over HTTP tRPC with a Bearer token:
  `apiTrpcClient.<router>.<proc>.mutate(...)` (`apps/desktop/src/renderer/lib/api-trpc-client.ts:12-25`),
  token from `getAuthToken()` (`apps/desktop/src/renderer/lib/auth-client.ts`). The file comment says this
  client is the established **mutation/upload** path (reads come via Electric). This is the upload channel.
- **local-db migrations** are a SEPARATE Drizzle/SQLite toolchain from `packages/db` (Neon/Postgres):
  config `packages/local-db/drizzle.config.ts`, generate `packages/local-db/package.json:22`, applied at
  runtime by `migrate(...)` in `apps/desktop/src/main/lib/local-db/index.ts:110`. Latest local migration is
  `0043_*`; the next is `0044_*`. local-db is WS-N's (NOT under the WS-O `packages/db` rule).

**What's missing (the D4 gap):** OS-history reading, a per-workspace local schema that separates imported
from native rows and carries a 7-day TTL, a 3–7-day upload job to our API, a post-upload local purge, the
server-side per-workspace cleaned-history tables (WS-O), and the consent/opt-in + privacy flow gating all of it.

---

## 2. Target design

### 2A. Aerial video wallpaper — data flow

```
WALLPAPERS manifest (packages/shared/src/appearance/wallpapers.ts)
   gradient[]            (shipped today, zero-asset)
   + video[] (NEW)  ──┐  source: { kind:"video", url|path, poster }
                      │
   ┌──────────────────▼─────────────────────────────────────────┐
   │ resolve in wallpaper store (renderer/stores/wallpaper/store) │
   │   rotate() / pickNext()  (unchanged)                         │
   └──────────────────┬─────────────────────────────────────────┘
                      ▼
   WallpaperLayer (@rox/ui/wallpaper-layer)
      gradient → mesh + scene overlay         (today)
      video    → <video muted loop playsInline> + poster + vignette  (NEW)
                      ▲
   WallpaperSection grid (settings) — previewBackground() returns poster for video
```

New `WallpaperSource` variant (additive, no consumer break):
```ts
// types.ts
type WallpaperSource =
  | { kind: "bundled"; path: string }
  | { kind: "remote";  url: string }
  | { kind: "gradient"; colors: readonly [string,string,string,string] }
  | { kind: "video";   src: string; poster: string }   // NEW (src = S3/remote or bundled path)
```

### 2B. Network-filter flag — resolution sequence (reuses WS-O override layer)

```
Settings surface needs NETWORK_FILTER for user U
        │  useFeatureFlagEnabled(FEATURE_FLAGS.NETWORK_FILTER)
        ▼
resolveFlag("network-filter", U):
   override = user_feature_flags WHERE user_id=U AND key='network-filter'   ← WS-O table
   if override != null: return override.value         ← admin/"developer" force-on
   else:                return posthog flag (cohort)   ← owner-only rollout
        │
        ▼  enabled? render <NetworkFilterSettings/> shell : render null
   (identical shape to useCommandWatcher's DISABLE_REMOTE_AGENT gate)
```

### 2C. Branch browser — components today (correct schema facts)

```
WorkspaceTab (= git worktree/branch)
  └─ Mosaic
      └─ BrowserPane ── usePersistentWebview ── <webview partition="persist:rox">
           ├─ BrowserToolbar (addr bar, nav, autocomplete) ── browserHistory.getAll (client filter)
           └─ BrowserOverflowMenu ── browserHistory.clear
                                          │
            local-db: browser_history  (id PK uuid, url UNIQUE, title, favicon_url,
                                        last_visited_at, visit_count)   ← global, no workspace/user/source
            session persist:rox  (cookies/cache/storage)  ── purge via browser.clearBrowsingData
```

### 2D. D4 browser-data pipeline — import / local-7-day / upload / purge / consent (data-flow)

```
                                ┌─────────── CONSENT GATE (opt-in, revocable) ───────────┐
                                │  browser_data_consent (local-db) + server consent flag  │
                                │  NO import / NO capture / NO upload until accepted       │
                                └───────────────────────┬─────────────────────────────────┘
                                                        │ accepted
   REAL browser (Chrome/Arc/Brave: <userdata>/<Profile>/History ;  Safari: ~/Library/Safari/History.db [FDA])
        │  main-process reader (read-only copy of the locked sqlite, parse rows)
        ▼
   IMPORT  ──▶ local-db browser_history_entries (NEW, per-workspace, source='import'|'native', imported_at)
        ▲                              │  also: native in-app visits upsert here (source='native')
        │                              ▼
   in-app <webview> visits      LOCAL 7-DAY WINDOW (retain ~7d; autocomplete reads this, scoped by workspace)
                                       │
                                       │  every 3–7 days (scheduler)         ┌────────────────────────────┐
                                       └──────── upload batch ──────────────▶│ apiTrpcClient.browserHistory │
                                                 (Bearer token, per-workspace)│  .upload.mutate(...)         │
                                                                              └────────────┬───────────────┘
                                                                                           ▼
                                          OUR SERVER: clean + dedupe → per-workspace history (WS-O tables)
                                                                                           │
                                       ┌───────────── after successful upload ─────────────┘
                                       ▼
   PURGE LOCAL: delete uploaded rows from local-db (keep only the trailing ~7d unуploaded window);
                consent-revoke ⇒ purge ALL local browser-data rows + stop scheduler
```

**Local schema (WS-N owns, local-db).** Do NOT overload the existing global `browser_history` (its `url`
unique constraint collapses cross-branch + import/native duplicates — see §1D / §7a#1). Add a **new
per-workspace table** `browser_history_entries`:
```ts
// packages/local-db/src/schema/schema.ts  (NEW table, migration 0044_*)
browserHistoryEntries = sqliteTable("browser_history_entries", {
  id, workspaceId text.notNull(),         // per-workspace (branch) — local
  url text.notNull(), title, faviconUrl,
  source text.notNull(),                  // "native" (in-app webview) | "import" (OS browser)
  visitedAt integer.notNull(),            // visit timestamp
  importedAt integer,                     // when imported (null for native)
  uploadedAt integer,                     // null = not yet uploaded; set after server ACK
}, (t) => ({ uniq: unique on (workspaceId, url, visitedAt) }))   // NOT a bare url-unique
// keep the legacy `browser_history` table for autocomplete back-compat OR migrate reads to the new table.
browserDataConsent = sqliteTable("browser_data_consent", {
  id, accepted integer (bool), acceptedAt, lastUploadedAt, revokedAt,
  sources text,                           // which OS browsers the user allowed importing
})
```

**Server schema (WS-O owns, `packages/db`).** WS-N PROPOSES, WS-O authors + generates:
```
organizations 1───* workspace_browser_history        (cleaned, long-term, per-workspace)
   id, organization_id(denorm, cascade, idx), v2_workspace_id(cascade, idx), user_id(cascade),
   url text.notNull(), title, favicon_url, visited_at timestamptz, visit_count int,
   first_seen_at, last_seen_at timestamptz
   UNIQUE(v2_workspace_id, user_id, url)   ← server-side dedup is per (workspace,user,url)
   + browser_data_consents  (organization_id, user_id, accepted bool, accepted_at, revoked_at)  // server record of consent
```
Server-side "cleaning" = drop tracking-param query strings, collapse repeated visits into
`visit_count`/`first_seen_at`/`last_seen_at`, drop obviously-sensitive hosts per a denylist.

**Upload API (authored under `packages/trpc` / `apps/api`, NOT WS-N's local IPC router).** A new
protected `browserHistory.upload` tRPC mutation: input = `{ v2WorkspaceId, entries: [{url,title,faviconUrl,visitedAt}] }`,
server upserts into `workspace_browser_history` (per-workspace dedup), returns the accepted ids so the
desktop can mark them `uploadedAt` and purge. Consent is enforced server-side too (reject upload if the
server consent record is absent/revoked). WS-N coordinates this contract; the cloud router file is owned by
the trpc/api owner (WS-N hands the schema + contract, like it hands tables to WS-O).

---

## 3. Phase-2 implementation tasks (TDD, bite-sized)

> Three tracks. Each task: files, test, expected behavior.

**Aerials**

- **N1 — Add `video` to `WallpaperSource`.** Modify `packages/shared/src/appearance/types.ts:16-19` to add `{ kind:"video"; src:string; poster:string }`. Update `Wallpaper` doc only if needed. Test: `packages/shared/src/appearance/types.test.ts` — assert a video-source wallpaper type-checks and `clampWindowOpacity` untouched. Behavior: type compiles; existing gradient entries unchanged.
- **N2 — Curated catalog → manifest entries.** Modify `packages/shared/src/appearance/wallpapers.ts` to append the chosen aerial clips as `kind:"video"` entries (after assets are hosted in S3 / bundled). Each carries `credit` (`types.ts:47`) with title + source URL + license from §1A. Test: `packages/shared/src/appearance/select.test.ts` — `pickNext` rotates across the now >1 mixed pool and never repeats current. Behavior: rotation includes video wallpapers.
- **N3 — Render video in WallpaperLayer.** Modify `packages/ui` `wallpaper-layer` (the component referenced by `stores/wallpaper/store.ts:7`) to branch on `kind:"video"` → muted, `loop`, `playsInline`, `autoPlay` `<video>` with `poster`, behind the same vignette/grain. Respect reduced-motion (fall back to poster `<img>`). Test: component test asserts a `<video muted loop>` renders for a video source and an `<img>`/gradient for others; reduced-motion renders poster only. Behavior: aerial plays as background, paused/poster under reduced-motion.
- **N4 — Settings preview for video.** Modify `WallpaperSection/wallpaper-section.utils.ts` `previewBackground()` to return the poster image for `kind:"video"`; ensure the grid button (`WallpaperSection.tsx:137-170`) shows the poster thumbnail. Test: `previewBackground` returns `url(poster)` for video. Behavior: grid shows still poster; selecting plays the clip.
- **N5 — License/attribution manifest doc.** Create `apps/desktop/docs/aerial-wallpapers.md` (NOT a plan) listing each shipped clip, source URL, license, and the S3 URI it was transcoded to. (Doc only; no code.) Behavior: legal provenance recorded.

**Network-filter flag**

- **N6 — Add flag key(s).** Modify `packages/shared/src/constants.ts:105-132` `FEATURE_FLAGS`: add `NETWORK_FILTER: "network-filter"` (+ optional `AUTOMATION_ACCESS: "automation-access"`) with doc comments mirroring the existing entries. **Coordinate with WS-F/WS-O** (they enumerate `FEATURE_FLAGS` for the admin flag UI / override table — key-agnostic, no schema change, `WS-F-spec.md:113,166`). Test: a `constants.test.ts` (create if absent) asserts keys present + values kebab-case unique. Behavior: new flags resolvable everywhere flags are read.
- **N7 — Gated Network Filter settings shell.** Create `apps/desktop/src/renderer/routes/_authenticated/settings/network-filter/page.tsx` + `components/NetworkFilterSettings/` gated by `useFeatureFlagEnabled(FEATURE_FLAGS.NETWORK_FILTER)` (mirror `useCommandWatcher.ts:37` + `cloud/page.tsx:13`). Renders an empty "Managed DNS (coming soon)" shell when on, `null` when off. Add to settings search/nav only when flag-on. Test: co-located `NetworkFilterSettings.test.tsx` — renders shell when flag true (mock `useFeatureFlagEnabled`→true), renders nothing when false. Behavior: surface appears only for owner/dev cohort.
- **N8 — (optional, if owner promotes automation flag) document mapping.** If `AUTOMATION_ACCESS` is added, wire it as an *additional* condition alongside `DISABLE_REMOTE_AGENT` in `useCommandWatcher.ts:40` (`shouldWatch = ... && automationEnabled`). Test: extend the watcher's behavior expectations. Behavior: automation watcher also respects the explicit per-user flag. (Hold unless owner confirms — `DISABLE_REMOTE_AGENT` already gates it.)

**Branch browser — D4 browser-data pipeline (import / local-7-day / upload / purge / consent)**

> Per D4 (`DECISIONS.md`). Build in dependency order: consent gate → local schema → OS import →
> per-workspace capture → upload + purge scheduler. Nothing captures or uploads until consent is given.

- **N9 — Consent / privacy opt-in flow (gates everything).** Add a `browser_data_consent` table to
  `packages/local-db` (see §2D) + a Settings → Privacy "Import & sync browser history" panel that explains,
  in plain language: which OS browsers will be read, that data is stored locally ~7 days, uploaded to Rox
  servers every 3–7 days, then purged locally, and that we keep a cleaned per-workspace copy server-side.
  Explicit accept/decline; revocable. On accept, record `acceptedAt` + chosen `sources`; on revoke, stop the
  scheduler and purge all local browser-data rows. Also record consent server-side (via the upload router's
  consent endpoint). Test: panel renders; accept writes consent row; revoke triggers purge + scheduler stop;
  every N10–N14 entry point is a no-op when consent is absent. Behavior: no import/capture/upload without consent.
- **N10 — New per-workspace local schema.** Add `browser_history_entries` (per-workspace, `source`,
  `visitedAt`, `importedAt`, `uploadedAt`, composite unique `(workspaceId, url, visitedAt)`) to
  `packages/local-db/src/schema/schema.ts`; generate `0044_*` via local-db's own Drizzle/SQLite toolchain
  (NOT Neon). Keep legacy `browser_history` for back-compat or migrate autocomplete reads to the new table.
  Test: schema/migration smoke + composite-unique allows same URL across branches. Behavior: import/native
  rows coexist, per-workspace, with an upload watermark.
- **N11 — OS-browser history reader (main process).** Add a main-process module that, gated by consent +
  chosen `sources`, locates and reads the real browser history DBs read-only: reuse
  `getChromiumUserDataDirs()` (`extensions/index.ts:41-79`) → `<userdata>/<Profile>/History` for
  Chrome/Arc/Brave/Chromium; `~/Library/Safari/History.db` for Safari (gate on Full Disk Access via
  `permissions/full-disk-access.ts`). Copy the (possibly locked) sqlite to a temp file, parse visit rows,
  normalize to `{url,title,faviconUrl,visitedAt,source:"import"}`. Expose via a NEW desktop IPC router
  `apps/desktop/src/lib/trpc/routers/browser-data/index.ts` (`importFromBrowser({source, workspaceId})`).
  Test: parse a fixture History DB → normalized rows; Safari path no-ops without FDA. Behavior: real history
  imports into `browser_history_entries` for the active workspace.
- **N12 — Per-workspace capture + autocomplete.** Update the in-app webview capture to write
  `browser_history_entries` with `workspaceId` + `source:"native"` (replace/augment the existing
  `browserHistory.upsert` call sites: v1 `usePersistentWebview.ts` ~`:263-269`, v2 `browserRuntimeRegistry.ts`
  ~`:254-260`), and point `useUrlAutocomplete` (`getAll`) at the new per-workspace table scoped to the active
  workspace (v1 + v2 `BrowserToolbar/hooks/useUrlAutocomplete/**`). Add the `getAll`/`search` per-workspace
  procedures to the `browser-data` IPC router. Test: capture two branches → autocomplete shows only the
  active branch's rows. Behavior: per-branch history end to end (the original per-branch goal, now via the
  new table). **Ownership glob includes `.../BrowserToolbar/hooks/**` in BOTH trees** (where `useUrlAutocomplete` lives).
- **N13 — Upload pipeline (every 3–7 days) + local purge.** Add a renderer/main scheduler that, when consent
  is active, batches not-yet-uploaded rows older than the cadence and calls the cloud
  `apiTrpcClient.browserHistory.upload.mutate({ v2WorkspaceId, entries })`
  (`api-trpc-client.ts:12-25`, Bearer token). On server ACK, set `uploadedAt`, then PURGE uploaded rows
  beyond the ~7-day local window (model on `browserHistory.clear` / `browser.clearBrowsingData`). Test: with
  a mocked `apiTrpcClient`, scheduler batches eligible rows, marks them uploaded, purges them; failed upload
  leaves rows for retry. Behavior: local store stays a trailing ~7-day window; long-term data is server-side.
- **N14 — Server schema + upload router (HANDOFF, not WS-N code).** WS-N PROPOSES the server tables
  (`workspace_browser_history`, `browser_data_consents` — §2D) to **WS-O** to author in `packages/db` and
  generate, and the `browserHistory.upload` + consent contract to the trpc/api owner. WS-N does NOT edit
  `packages/db/src/schema/**` or the cloud router. Behavior: cleaned, per-workspace history persists server-side;
  consent enforced server-side. (Tracked here so the handoff is explicit; WS-O/trpc own the implementation.)

> Note: this supersedes the earlier "v1↔v2 consolidation vs per-branch column" alternative — D4 mandates the
> full pipeline. The per-branch goal is satisfied by the new `browser_history_entries` table (N10/N12).

---

## 4. File ownership (Phase-2 merge isolation)

**WS-N owns / may modify exclusively:**
- `packages/shared/src/appearance/**` — `types.ts`, `wallpapers.ts`, `select.ts` + their tests (video source + catalog).
- `packages/ui/src/**wallpaper-layer**` — the wallpaper layer component (video render branch) only.
- `apps/desktop/src/renderer/routes/_authenticated/settings/appearance/components/AppearanceSettings/components/WallpaperSection/**` — wallpaper settings grid + utils.
- `apps/desktop/src/renderer/routes/_authenticated/settings/network-filter/**` — NEW gated settings route + components (WS-N creates).
- `apps/desktop/src/lib/trpc/routers/browser-history/**` — the legacy browser-history router (+ new test).
- `apps/desktop/src/lib/trpc/routers/browser-data/**` — NEW desktop IPC router (D4: `importFromBrowser`,
  per-workspace `getAll`/`search`, consent read/write) + tests.
- The NEW OS-browser history-reader main-process module (under `apps/desktop/src/main/lib/browser-import/**`
  or equivalent) — read-only OS history parsing (reuses `getChromiumUserDataDirs()`, FDA probe).
- The D4 upload scheduler (renderer/main) + the Settings → Privacy consent panel (D4).
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/BrowserPane/hooks/**`,
  `.../BrowserPane/components/BrowserToolbar/hooks/**`, and the v2 `.../usePaneRegistry/components/BrowserPane/**`
  hooks (incl. its `BrowserToolbar/hooks/**`) — the capture + autocomplete call sites (`usePersistentWebview`/
  `browserRuntimeRegistry`, `useUrlAutocomplete`) in BOTH v1 and v2 trees.
- `packages/local-db/**` — NEW `browser_history_entries` + `browser_data_consent` tables + their migration
  (`0044_*`, local SQLite only — NOT under the WS-O `packages/db` rule).
- `apps/desktop/docs/aerial-wallpapers.md` — NEW doc.

**WS-N HANDS OFF (does NOT author) per D4:**
- Server-side per-workspace history tables (`workspace_browser_history`, `browser_data_consents`) →
  **WS-O** (`packages/db/src/schema/**` + generate). WS-N supplies the §2D shapes.
- The cloud `browserHistory.upload` + consent tRPC mutation (`packages/trpc` / `apps/api`) → the trpc/api owner.
  WS-N supplies the input/dedup contract.

**WS-N must coordinate (shared file — NOT exclusive):**
- `packages/shared/src/constants.ts` `FEATURE_FLAGS` — **shared with WS-F/WS-O** (they enumerate it for the admin flag UI / override table). WS-N adds only the new keys (`NETWORK_FILTER`, optional `AUTOMATION_ACCESS`); coordinate the single edit to avoid a conflict (`WS-F-spec.md:201` defers key-adds to "owner/WS-O scope" — agree at wave start who lands the key).

**WS-N must NOT modify:**
- `user_feature_flags` schema / `resolveUserFlag` / `upsertUserFlagOverride` — **WS-O** owns (WS-N only reads via `useFeatureFlagEnabled`).
- `apps/admin/**` and `packages/trpc/src/router/admin/**` — **WS-F**.
- `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/**` — touch only in N8 and only if owner confirms the automation-flag promotion; otherwise leave to its current owner.
- The NextDNS backend/native integration — that is `plans/2026-06-18-managed-nextdns-profile.md`'s workstream; WS-N ships only the flag + empty shell.

---

## 5. Dependencies + suggested wave

**Soft dependencies / coordination:**
- **WS-O** — owns the `user_feature_flags` override table + resolve/upsert helpers. WS-N's `NETWORK_FILTER` flag is just another key (no schema change). N6/N7 can ship before WS-O lands (PostHog cohort fallback works standalone); admin force-on for the owner needs WS-O.
- **WS-F** — enumerates `FEATURE_FLAGS` in the admin flag UI; align on who edits `constants.ts` and on whether "developer-id" gating becomes a `developerProcedure` (`WS-F-spec.md:214`). WS-N does not invent a parallel developer-id mechanism.
- **Aerials hosting** — needs the chosen clips downloaded + transcoded + uploaded to `s3://agent-artifacts/media/rox-aerials/...` (or a small bundled subset) before N2/N3 reference real URLs. Self-contained to WS-N otherwise.

**No hard blockers.** Aerials track and branch-browser track are fully independent of other workstreams.

**Suggested wave: P1** (polish lane).
- Aerials (N1–N5): P1, parallelizable immediately; only the asset-hosting step is sequential before N2.
- Network-filter flag (N6–N7): P1, after a 1-line coordination with WS-F/WS-O on the `constants.ts` edit. N8 deferred/optional.
- Branch-browser D4 pipeline (N9–N14): P1. Build order = consent (N9) → local schema (N10) → OS import
  (N11) → per-workspace capture (N12) → upload+purge (N13); N14 is a WS-O / trpc handoff (server tables +
  upload router). The local desktop track (N9–N13) is independent of other workstreams; only N13's upload
  depends on N14's server endpoint existing (stub the mutation until it lands).

---

## 6. Target PR

- **Branch:** `t/ws-n-infra-polish-aerials-netfilter-branchbrowser`
- **PR title:** `feat(desktop): aerial video wallpapers + network-filter flag + browser-data import/sync/upload pipeline (WS-N)`

> The branch-browser deliverable is large enough (D4) that it may be split into its own PR
> (`t/ws-n-browser-data-pipeline`) separate from the aerials + network-filter PR.

### Decision updates (resolved forks — see `DECISIONS.md`)

- **D4 (owner):** the branch browser is now a full **import (real Chrome/Arc/Safari history) → local
  ~7-day retention → upload to our server every 3–7 days → local purge** pipeline, keeping a cleaned
  **per-workspace** history server-side, gated by a mandatory **consent / privacy opt-in** flow. This
  **supersedes** the earlier "nullable `workspaceId` column vs composite `(url, workspaceId)` unique"
  question (former residual #7): history is per-workspace both locally and server-side, via the NEW
  `browser_history_entries` local table and the NEW `workspace_browser_history` server table. See §1D, §2D,
  tasks N9–N14, and the §4 ownership/handoff updates. Aerials (N1–N5) and the network-filter flag (N6–N8)
  are unchanged.

---

### 7. Hardening review

Read-only verification pass against live code (2026-06-20). Verified the structural claims; spot-checked every file:line cite. Net: spec is sound and implementation-ready; a handful of line/label cites are off and one diagram field is wrong. No merge-overlap risks found.

#### (a) Factual corrections (file:line)

1. **`browserHistory` PK is `id`, not `url` — §2C diagram is wrong.** The diagram (line 164) says `browserHistory (url PK, ...)`. Actual schema (`packages/local-db/src/schema/schema.ts:448-466`): PK is `id text` (uuid `$defaultFn`); `url` is `text("url").notNull().unique()`. The upsert's `onConflictDoUpdate target: browserHistory.url` (`browser-history/index.ts:55`) works because of the *unique* constraint, not a PK. Correction is cosmetic for the diagram but matters for N9/N10: a `workspaceId` column changes uniqueness semantics — if history is scoped per branch, the same URL can legitimately recur across branches, so the **`url` unique constraint must become a composite `(url, workspaceId)` unique** (or the `onConflictDoUpdate` target must change), else cross-branch visits to the same URL collide on one row. **This is a real design gap N9/N10 must address, not just "add a nullable column."**

2. **`usePersistentWebview.ts:115` cite is the mutation-hook declaration, not the upsert call.** Spec (lines 100, 192) cites `:115` as the upsert/populate-on-navigation site. Actual: `:114-115` is `const { mutate: upsertHistory } = electronTrpc.browserHistory.upsert.useMutation();`; the actual `upsertHistory({...})` **call is at `:264`**. N11 should thread `workspaceId` into the call site (`:264`), not `:115`.

3. **`useUrlAutocomplete.ts:22` path/line under-specified.** Spec (lines 100, 192) cites `.../BrowserPane/hooks/useUrlAutocomplete.ts:22`. The hook is actually under `.../BrowserPane/components/BrowserToolbar/hooks/useUrlAutocomplete/useUrlAutocomplete.ts` (it lives in `BrowserToolbar/hooks`, not `BrowserPane/hooks`). Both v1 and v2 copies exist at the analogous BrowserToolbar paths. The N11 file-ownership entry (line 206) names "`...BrowserPane/hooks/**`" which would **miss** `useUrlAutocomplete` since it sits under `BrowserToolbar/hooks`. Ownership glob must include `.../BrowserToolbar/hooks/**` for both trees.

4. **`useCommandWatcher` `shouldWatch` formula is richer than implied; cite drift.** Spec (line 81) says lines `:37-40`, `useFeatureFlagEnabled(DISABLE_REMOTE_AGENT)` → `shouldWatch (:40)`. Actual: the flag hook is `:37-39` and `shouldWatch = !!deviceInfo && !!organizationId && !remoteAgentDisabled` at `:40`. N8's proposed `shouldWatch = ... && automationEnabled` (line 186) is therefore correct in shape but must AND into a 3-term expression, not a 1-term one. Minor; flagged so N8 doesn't drop the `deviceInfo`/`organizationId` guards.

5. **developer-id grep result overstated.** Spec (line 76) claims a repo-wide grep for `isDeveloper|developerId|developer_id|DEVELOPER_USER_IDS` "returns only the dev login constants and Apple Developer ID strings." Actual: that exact grep over `apps/desktop`+`packages/shared` returns **zero** matches (the dev-credentials file uses `DEV_EMAIL/DEV_PASSWORD/DEV_NAME`, not any `developer*` identifier; Apple "Developer ID" strings didn't surface for those patterns either). The load-bearing conclusion — **no in-code developer-id gate exists today** — is fully correct; only the "what the grep returns" detail is inaccurate. WS-F's own review (`WS-F-spec.md:18`) independently confirms "no … 'developer-id' concept yet."

6. **FEATURE_FLAGS contents + range: correct.** `constants.ts:105` opens `FEATURE_FLAGS`; the 7 keys (`ELECTRIC_TASKS_ACCESS`, `WEB_AGENTS_UI_ACCESS`, `GITHUB_INTEGRATION_ACCESS`, `CLOUD_ACCESS`, `DISABLE_REMOTE_AGENT`, `SLACK_MCP_V2`, `RELAY_URL_OVERRIDE`) all verified verbatim. Note the block ends ~`:132` but actual content runs slightly past depending on comments — the "`:105-132`" range is accurate enough.

7. **Verified-correct cites (no change needed):** `types.ts:16-19` `WallpaperSource` has exactly gradient/bundled/remote, **no `video`** ✓ (the one real aerials code gap, correctly identified); `wallpapers.ts:15` `WALLPAPERS` all gradient ✓; `types.ts:67-90` `AppearanceSettings` fields ✓; `types.ts:47` `credit?` field exists ✓; `store.ts:66` `WALLPAPERS.length <= 1` guard exact ✓; `select.ts:47` `pickNext` exists (N2 test target valid) ✓; `browser-history/index.ts` 4 procedures `getAll`(limit 500)/`search`(limit 10)/`upsert`/`clear`, all `publicProcedure`, no `workspaceId` ✓; both v1 and v2 BrowserPane trees exist ✓; `browserRuntimeRegistry.ts:255` upsert ✓; `relay-url.ts` uses `getFeatureFlagPayload(FEATURE_FLAGS.RELAY_URL_OVERRIDE, userId)` (~`:24`) ✓; `BrowserPane.tsx:132` empty-state block ✓; nextdns plan + all sibling specs (WS-A…WS-O) present ✓.

#### (b) Brief questions not fully answered

- **Aerials curation — not independently re-verified live.** The 32-row catalog is plausible and well-licensed by source, but this review did not re-run Exa/WebFetch against each of the 32 URLs to confirm they still resolve and that per-clip license tags (esp. the "Pexels CC0" rows #23/#29 and the Pixabay 4K rows) are accurate today. Two structural caveats stand: rows **16-19 are collection landing pages, not single clips** (so the literal "~30 clips" is ~28 concrete + 4 collections), and the **Pexels License forbids identifying depicted people and selling unmodified copies** — fine for embedded wallpaper, but the N5 license doc should record per-clip license at download time, not trust the source-level summary.
- **Per-branch vs global history — product intent unresolved.** §1C/N9-N11 default to per-branch history scoping, but the brief only asked "what is the branch browser / how viewed." Whether the owner actually wants per-branch history (vs the v1↔v2 consolidation alternative at line 194) is an open product call. The unique-constraint consequence in correction (a)(1) raises the cost of the per-branch default — worth confirming before building.
- **Automation-flag promotion (N8) — gated on owner confirm, correctly.** Spec already holds N8. No gap, just noting it stays a question, not a task.
- **`RELAY_URL_OVERRIDE` is a payload flag, not boolean** — WS-F's review (`WS-F-spec.md:264`) flags that the override table's boolean model can't represent payload flags. WS-N's `NETWORK_FILTER`/`AUTOMATION_ACCESS` are intended as boolean, so unaffected — but if the network filter ever needs config payload (e.g. a NextDNS profile id), it would hit the same limitation. Note for Phase 2.

#### (c) Merge-safety / file-ownership check

Checked WS-N's §4 ownership list against WS-A…WS-O. **Result: no overlap on any exclusively-owned file. One correctly-declared shared file. One glob fix needed.**

- **`packages/shared/src/appearance/**`** (types/wallpapers/select + tests), **`packages/ui/**wallpaper-layer**`**, **`WallpaperSection/**`**, **`settings/network-filter/**`** (new), **`browser-history/**`**, **`apps/desktop/docs/aerial-wallpapers.md`** (new): grepped all sibling specs — **no other workstream references appearance, wallpaper, browser-history, or network-filter.** Clean exclusive ownership. ✓
- **`packages/local-db/**`** (browserHistory column): WS-O owns `packages/db/src/schema/**` — but `browser_history` lives in **`packages/local-db/src/schema/schema.ts`**, a *different package*. The schema-ownership rule ("schema owned by WS-O except economy.ts=WS-E") covers `packages/db` only. **No WS-O overlap** — local-db is genuinely WS-N's. Spec correctly scopes it "local SQLite only." ✓ (Minor: confirm no other spec touches local-db; grep found none.)
- **`packages/shared/src/constants.ts` `FEATURE_FLAGS`** — **correctly declared as shared/coordinated, not exclusive** (§4 line 211). Cross-checked: WS-A/WS-B reference `constants.ts` only for **URL constants at `:17-28`** (`COMPANY.GITHUB_URL`/`DOCS_URL`), a different region from `FEATURE_FLAGS` (`:105+`) — no conflict there. WS-F (`:201`) and WS-O (`:147`) both defer flag-key adds to "owner/WS-O/product" scope. So three specs name the same `FEATURE_FLAGS` block: WS-N wants to add keys, WS-F/WS-O say keys are owner/WS-O's call. **This is the single coordination point, already flagged by WS-N (lines 89, 211, 225) — agree at wave start who lands the key edit.** Low risk (append-only key adds), but a true shared edit, not isolated. **Flag: confirm WS-O lands the key-add to keep one owner of the block.**
- **`useCommandWatcher/**`** — WS-N §4 correctly says NOT to modify except in N8 with owner confirm. No sibling claims it either. ✓

**No conflicting exclusive claims. One shared file (constants.ts FEATURE_FLAGS) properly coordinated. One ownership-glob fix: extend the N11 BrowserPane-hooks glob to include `.../BrowserToolbar/hooks/**` (where `useUrlAutocomplete` actually lives) in both v1 and v2 trees.**

#### (d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| Aerials: `WallpaperSource` has no `video` kind; gradient-only pack shipped | **High** | `types.ts:16-19`, `wallpapers.ts:15` read directly |
| Aerials: video render is the one real code gap | **High** | Confirmed against types + store guard |
| Aerials curated catalog accuracy (URLs/licenses live) | **Medium** | Prior agent's live search; not re-verified per-URL here; 4 rows are collections |
| Net-filter: no in-code developer-id gate exists | **High** | Zero-match grep + independent WS-F confirmation |
| Net-filter: FEATURE_FLAGS is the real gating mechanism; add key + gate like `useCommandWatcher`/`cloud/page` | **High** | `constants.ts:105`, `useCommandWatcher.ts:37-40`, `relay-url.ts` all verified |
| Net-filter: `user_feature_flags` override table is key-agnostic (no schema change for new keys) | **Medium-High** | Cross-confirmed in WS-F/WS-O specs; the table itself is not yet built (WS-O scope) |
| Branch browser: pane inside workspace worktree; v1+v2 trees; history via local-db tRPC router | **High** | All paths/lines verified live |
| Branch browser: history is global, no `workspaceId` (real per-branch gap) | **High** | `schema.ts:448-466` has no workspace column |
| Per-branch history is a clean additive change | **Medium** | Additive column yes, but the `url` unique constraint must become composite — more than "nullable column" (correction a1) |
| File ownership has no sibling overlap (except coordinated constants.ts) | **High** | Grepped all WS-A…WS-O specs |
