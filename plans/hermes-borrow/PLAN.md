# Hermes-Borrow → Rox: Multiplatform UI/UX Borrow Plan

> **Branch:** `feat/hermes-borrow-multiplatform` (off `main` @ v2.0.51) → merge back to `main`.
> **Reference UI:** `github.com/nesquena/hermes-webui` (v0.30).
> **Companion docs:** `CATALOG.md` (58-feature reference), `GAP-MAP.md` (brownfield grading).
> **Method:** 2× parallel agent workflows (recon+ideation of Hermes; brownfield gap-map of Rox) + structured interview.
> **Audience:** an executor agent. Every feature below has target packages, an integration note, effort, and a done-criterion.

---

## BLUF

Borrow Hermes WebUI's organized, beautiful chat/agent surfaces into Rox **by extending existing packages, not rewriting**. Rox already ships ~60% of the substrate (multi-tenant auth, `chatSessions` with labels/archive, `@rox/panes` workbench, mature motion tokens, file-tree, presence via `@rox/collab`). The work is mostly: **(a)** new UI in `@rox/ui` following the calm-console design language, **(b)** a handful of new tables/fields (`chat_labels`, `agent_personas`, `chat_saved_views`, `pinned`, `accent_color`, message FTS), **(c)** lifting desktop-only logic into shared packages so web + mobile reach parity from one core.

The **4 user favorites** land first (Phase 1) on a shared foundation (Phase 0): ① colored tag pill-bar, ② dual-identity card (human + agent persona), ③ team-vs-personal workspace switcher, ④ right files panel.

---

## Locked decisions (from interview)

| Axis | Decision |
|---|---|
| Target repo | `agisota/rox`, branch `feat/hermes-borrow-multiplatform` → merge to `main` |
| Platforms | **All three** (web + mobile + desktop) from one core |
| Audience | **Team / multi-user from day one** — collaboration cluster in scope |
| Tags vs identity | **Separate orthogonal axes** (organization ⟂ who/where) |
| Tag model | **Both layers + AI** — server-backed projects/labels (F10/F11) + lightweight `#tags` (F13) + AI auto-tag/title (F14) |
| v1 scope | **Full** — beyond the 4 favorites: conversation canvas, collaboration, power (⌘K + sync), theming + motion |
| Files panel | **Full manager + tabs** Files / Artifacts / Todos (F30/F34) |
| Motion | **Shared motion tokens now** — `motion.json` → CSS vars (web/desktop) + RN Reanimated (mobile), full signature set + reduced-motion contract |

---

## Stack reality & surface strategy (READ FIRST)

Definitive stack (from gap-map):

- **Monorepo:** Bun 1.3 · Turbo 2.9 · Biome 2.4 (**warnings fail CI**).
- **Desktop (`apps/desktop`) = the REAL product surface:** Electron 40 · electron-vite · Vite 7 · React 19 · TanStack Router (file-based, `routeTree.gen.ts`) · Tailwind v4. IPC = tRPC via `trpc-electron` (**subscriptions MUST be observables, not async generators**). Pane engines: **LEGACY `react-mosaic` (do NOT extend)** and **V2 `@rox/panes` Workspace (extend this)**. Window chrome `frame:false`, glass/vibrancy; **single `BrowserWindow`**.
- **Web (`apps/web`):** Next.js 16 App Router (`proxy.ts`, not `middleware.ts`) · React 19.2 · Tailwind v4 · shadcn/ui from `@rox/ui` · motion 12 · next-themes (**currently `forcedTheme='dark'`, single skin**). **Agents UI is largely a READ-ONLY MOCK today.**
- **Mobile (`apps/mobile`):** Expo 56 · RN 0.85 · expo-router · `@rn-primitives/*` · `@expo/ui` (SwiftUI) · Uniwind. **Separate token/component layer — does NOT import `@rox/ui`.**
- **State:** zustand 5 + TanStack Query. Cross-device persisted = **TanStack DB collections synced by ElectricSQL** (cache-first: render existing rows before `isReady`). `better-auth` for session/active-org.
- **API:** tRPC v11 (`packages/trpc`, superjson) via TanStack Query; host FS/git via `packages/host-service` reached through `@rox/workspace-client`/relay.
- **Data:** Drizzle ORM — `packages/db` (Neon Postgres, Electric-synced) + `packages/local-db` (desktop SQLite) + `packages/agent-state` (libSQL).
- **Styling:** Tailwind v4 + **OKLCH semantic CSS-var tokens** in `packages/ui/src/globals.css`. Desktop runtime theme store (Theme×named-Skin, Zed library). Mobile tokens separate.
- **Motion:** mature `@rox/ui/motion` (append-only contract-tested `tokens.ts`, 45 primitives, `useShouldAnimate` 3-state×2-tier governor with OS reduced-motion clamp). Web doesn't yet wire `setMotionPreferenceSource`. No View Transitions.
- **Gaps:** No i18n framework (strings hardcoded RU). No PWA on web.

### Surface strategy — how we honor "all three at once" against reality

The honest sequencing that satisfies multiplatform-first **without pretending web/mobile are already real**:

```
            ┌─────────────────────────────────────────────────────────┐
   SHARED   │  packages/* — db · trpc · sdk · ui(+motion) · panes ·    │  ← logic + tokens
    CORE    │  chat · workspace-fs · collab · shared · auth            │     live here, once
            └───────────────┬─────────────────┬───────────────────────┘
                            │                 │                 │
              apps/desktop  │     apps/web     │   apps/mobile   │
              (LEAD: real)  │ (mock → real)    │ (token bridge)  │
              extend v2     │ remove forcedThm │ RN adapters of  │
              panes/sidebar │ wire real trpc   │ shared logic    │
```

**Rule for every feature:** put framework-agnostic logic/types/tokens in the shared package first, then render on each surface. Desktop is the proving ground (it's the mature surface); web parity = lift desktop module to `@rox/ui` + wire real tRPC (replacing mock); mobile parity = RN adapter consuming the same shared core. A feature is only "done" when the **shared layer** exists; per-surface rendering is tracked as workstreams (see §Cross-platform workstreams). This is decided, not open — it is the only path that yields "one core, three surfaces."

---

## Architecture principles (non-negotiable for this branch)

1. **Extend, don't rewrite.** Reuse the listed target packages. Never add a "shell" package; never extend `react-mosaic`; never hand-edit `drizzle/*` (edit `packages/db/src/schema/*.ts` then `bunx drizzle-kit generate`).
2. **Tags ⟂ Identity.** Organization axis = `chat_labels` (+ `chatSessions.labels` membership array). Identity axis = `agent_personas` + `userProfiles` + org/workspace. Never overload one onto the other. Never overload `agentSources` (backend registry) as a user-facing persona.
3. **One core.** Logic/types/tokens → shared package; surfaces only render. tRPC procedures are the single backend for all three clients.
4. **Electric-synced where cross-device, local-db where device-local.** New synced state (labels, saved views, prefs) → Electric shapes with `organizationId` denormalized; device-only (window bounds) stays in `local-db`.
5. **Motion through the governor.** Every animation reads a `@rox/ui/motion` token and is gated by `useShouldAnimate`; always provide an instant final-state fallback. `tokens.ts` is append-only.
6. **CI is green-or-nothing.** Biome warnings fail CI. Co-locate `*.test.tsx`. `bun test` + `turbo build` must pass per phase.

---

## Data model changes (ERD view)

Existing entities are reused heavily. New/changed in **bold**.

```
auth schema (better-auth, ALREADY MULTI-TENANT — reuse as-is for team day-1)
  organizations(id, name, slug, logo, metadata, stripeCustomerId, allowedDomains[])
    + ADD accent_color            ← F25/F29 per-workspace retint; isPersonal derived from metadata/member-count
  members(orgId, userId, role) · teams · teamMembers(orgId denormalized) · invitations
  users(id, name, email, image, organizationIds[]) · sessions(activeOrganizationId, activeTeamId)
  accounts(OAuth)

public schema
  userProfiles(userId, handle, displayName, bio, avatarUrl, isPublic, ...socials)   ← human half of dual-identity (F21)
  ★ agent_personas(id, ownerUserId, organizationId, displayName, avatarUrl, handle,
                   accentColor, themeJson)                                          ← NEW: persona half (F21/F22/F29)
       active-persona pointer: mirror activeOrganizationId on session, or client store
  chatSessions(id, title, status[active|archived], labels jsonb<string[]>,
               lastActiveAt, workspaceId, v2WorkspaceId, org, createdBy, learnedAt)
    + ADD pinned bool / pinnedAt                                                    ← F19 (archive half already exists)
  chatMessages(org, session, role, content, metadata, parent_message_id)
    + ADD authorUserId, personaId                                                   ← F38 canvas authorship
    + ADD tsvector(content) + GIN index                                            ← F15 full-text search
  ★ chat_labels(id, organizationId, name, color, icon, seed)                        ← NEW: label color/icon registry (F11)
  ★ chat_saved_views(id, organizationId, createdBy, name, rule jsonb, color)        ← NEW: saved views/smart folders (F17)
  ★ user_preferences / org_settings (Electric-synced, org_id denormalized)         ← NEW: portable prefs incl. locale (F46/F58)
  ★ profile_skill_assignments / profile_mcp_servers (keyed by personaId)           ← NEW: profile-scoped capability (F47)
  v2Projects(org, name, slug, repoCloneUrl, githubRepositoryId)        ← product "workspace"
  v2WorkspaceLocalState.paneLayout (Electric)  + ADD expandedDirs                  ← F32 persisted tree expansion
  v2UserPreferences(sidebarOpen/Tab/Width)  + ADD rightPanel peek-state            ← F03 3-state panel
  skills / skillVersions / skillBindings(exposedVia mcp|command_palette) + org-library   ← F47 reuse
  tasks(labels, status_color, status_type)            ← color-label precedent to mirror
  workspaceSections (local-db: name, color, collapse, tabOrder, DnD)   ← folder/section primitive to transplant for tag rail
```

Pure utilities (no DB): **`@rox/shared` deterministic glyph/color generator** seeded from id/handle (F24) — shared by identity avatars and tag auto-color (F11).

DB workflow: edit `packages/db/src/schema/*.ts` → `bunx drizzle-kit generate`. Enums append-only. Stamp `organizationId` for Electric shapes.

---

## Surface map (target shell, all platforms from one DOM/tree)

```
DESKTOP / WIDE WEB                                    favorites placed:
┌──── titlebar (drag-exempt) · IdentityStatusLine (F36): @you · #ws · as Persona · 3 online ────┐
├──┬──────────────────┬──────────────────────────────┬──────────────────────┤
│R │ 🔎 search (F15)   │ topbar: title · model · clear │ WORKSPACE (F30)       │
│A │ ● tag pills (F10) │ ┌──────────────────────────┐ │ Files│Artifacts│Todos │
│I │ ★Pinned (F19)     │ │  conversation canvas      │ │ breadcrumb            │
│L │ TODAY (F18)       │ │  Activity worklog (F39)   │ │ ▾ tree (F31) icons·size│
│  │ • chat ●dot #tag  │ │  tool/thinking (F40)      │ │   preview (F33)        │
│⚙ │   (F12/F13/F20)   │ └──────────────────────────┘ │ git badge·blame(F35)   │
│  │ ┌ dual-identity ┐ │ [persona][ws][model][◔][🎤]  │ (3-state demand F03)   │
│  │ │ 👤you ▸Persona│ │ Message…  /cmd  📎 ▶ (F42)   │                        │
└──┴─(F21/F22/F25)───┴──────────────────────────────┴──────────────────────┘
PHONE (<=640): same tree reflows — sidebar=slide-in drawer, right panel=slide-over,
rail=hamburger, composer chips→one config button w/ context ring; gestures primary (F05/F51).
```

---

## Phases

Each phase ends with an **acceptance gate** (must pass before the next). Status legend from gap-map: `exists` (wire/expose only) · `partial` (extend) · `missing` (build). Effort S/M/L.

### Phase 0 — Shared foundation
**Goal:** lay cross-platform primitives every favorite depends on, so later phases extend not rewrite.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F01 | Three-pane adaptive shell | partial | `apps/desktop/_dashboard/layout.tsx` · `@rox/panes` · `@rox/ui` | Formalize left-nav \| center-panes \| right-context as 3 resizable regions (reuse `ResizablePanel` + sidebar-state stores). **Done:** 3 regions resize+persist, no new shell pkg | M |
| F02 | Icon rail + active accent | partial | `apps/desktop DashboardSidebar` · `@rox/ui` | Add ~52px RAIL mode + active accent indicator (reuse `ActiveIndicator` + `motionSpring.sidebarCollapse`). **Done:** rail toggles, active tab accented | M |
| F04 | Persisted resizable panes | exists | `@rox/panes` · `useV2WorkspacePaneLayout` | **Reconcile binary(`types.ts`) vs n-ary(README) split model first.** **Done:** split model documented + tests green | S |
| F07 | Calm-console design tokens | exists | `@rox/ui` | Extend ramp + missing semantic tokens (info/success/warning); add `DESIGN-LANGUAGE.md` beside `MOTION-LANGUAGE.md`. **Done:** tokens + doc | S |
| F24 | Deterministic glyph/color | missing | `@rox/shared/src/identity-glyph` · `@rox/ui/atoms/Avatar` | Pure `hash(id/handle)→stable HSL+geometric glyph` (co-located test); `Avatar` accepts `seed`. **Done:** util + Avatar render glyph, shared with F11 | M |
| F53 | Motion tokens + governor | exists | `@rox/ui` motion · `apps/web` | Wire web: `setMotionPreferenceSource` via `AppearanceProvider`, register at boot like desktop. **Done:** web animations gated by `useShouldAnimate` | S |
| F55 | Signature motion set | exists | `@rox/ui` motion | Append Hermes moments as new primitives (token-built, tiered, instant fallback). **Done:** primitives added, contract test green | S |

**Gate 0:** 3-region shell resizes+persists on desktop; glyph util shipped+tested; web honors motion governor; `bun test` + `turbo build` green.

### Phase 1 — User favorites (the 4 locked wins)
**Goal:** land tags pill-bar, dual-identity card, team-vs-personal switcher, right files panel — tags ⟂ identity.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F10 | Colored tag pill-bar ① | missing | `@rox/ui TagFilterPillBar` · `apps/desktop ChatPane` · `chatRouter` | Derive pills from distinct `labels`; add `labelsAny/labelsAll` to `listSessions`. **Done:** click-filter list by tag | L |
| F11 | Tag color/icon studio + auto-color ① | missing | `packages/db chat_labels` · `trpc` · `@rox/ui` | New `chat_labels` table + CRUD; auto-color = hash→palette (share F24). **Done:** create/rename/recolor label, stable color | L |
| F12 | Per-row color dot ① | missing | `@rox/ui SessionRow` · desktop/web rows | Render dot from primary label color (flex-sibling, survives ellipsis). **Done:** dot on rows | S |
| F03 | 3-state right files panel ④ | partial | `apps/desktop v2-workspace` · promote to `@rox/panes`/`workspace-client` | Add intermediate **peek** snap to sidebar state machine (today 2-state). **Done:** hidden/peek/expanded + edge reopen, persisted | M |
| F30 | Panel header + Files/Artifacts/Todos tabs + breadcrumb ④ | partial | `apps/desktop WorkspaceSidebar` | Add Artifacts+Todos `SidebarTabDefinition` + breadcrumb above FilesTab. **Done:** 3 tabs + breadcrumb | M |
| F31 | IDE file-tree (icons + size col) ④ | exists | `apps/desktop FilesTab (@pierre/trees)` → generalize to `@rox/ui` | Surface size via `renderRowDecoration` + `getMetadata`. **Done:** colored icons + tabular size; ported wrapper | S |
| F34 | In-tree create/rename/delete + drag-upload + cruft filter ④ | exists | `apps/desktop FilesTab` | Wire intra-tree row drag-move (`movePath`). **Done:** full CRUD+upload+move, ignored dimmed | S |
| F21 | Dual-identity card (human + persona) ② | partial | `packages/db agent_personas` · `trpc identity` · `@rox/ui DualIdentityCard` | New `agent_personas` table + CRUD; compose card (human half exists). **Done:** card shows human + active persona | L |
| F22 | Identity/persona switcher chip ② | partial | `apps/web AgentsHeader→IdentitySwitcher` · `@rox/ui` · session | Fork `AgentsHeader` (switches orgs today) into persona switcher; add active-persona pointer. **Done:** switch persona, presentational chip in `@rox/ui` | M |
| F23 | Identity detail card in dropdown ② | partial | `apps/web settings/identity` · `@rox/ui ProfileDetailCard` | Lift `IdentitySettings` cards into reusable `ProfileDetailCard`; embed in dropdown. **Done:** detail card in switcher | M |
| F25 | Personal-vs-team workspace switcher + accent retint ③ | partial | `apps/desktop OrganizationDropdown` · mobile sheet · `@rox/ui` · `db auth.ts` | Derive `isPersonal`; group Personal/Teams; add `organizations.accent_color` → `--workspace-accent` on active-org change. **Done:** grouped switcher + accent retint to OS chrome | M |
| F26 | Searchable workspace switcher ③ | partial | `apps/desktop OrganizationDropdown` · `@rox/ui WorkspaceSwitcher` | Swap plain list for `cmdk` Command/Combobox over `collections.organizations`. **Done:** filter by name/path | S |
| F28 | Multi-tenant org root | exists | `db auth.ts` · `@rox/auth` · `trpc/organization` | **Reuse as-is**; only add web-parity switcher (F26). **Done:** active-org selection works on web too | S |

**Gate 1:** all 4 favorites usable on **desktop**; `chat_labels`+`agent_personas`+`accent_color`+`pinned` migrations generated via drizzle-kit; tags⟂identity verified (no shared table); shared components live in `@rox/ui`. Visual proof (Peekaboo/Playwright) of pill-bar + identity card + workspace retint + files panel.

### Phase 2 — Collaboration & identity-in-context (team day-1)
**Goal:** turn on multi-user surfaces — presence, message authorship, identity status line, org/team management parity.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F36 | Identity status line | missing | `@rox/ui IdentityStatusLine` · web/mobile shell · session | Presentational line: human + persona + org (reuse Avatar+accent). **Done:** mounted in shell header | S |
| F37 | Member avatars + presence + private/shared lock | partial | `@rox/ui PresenceStack` · `@rox/collab` · web rooms | Presence+avatars **ship** (Liveblocks `useOthers`); add `RoomVisibilityBadge` (private/shared lock). **Done:** presence + lock glyph, no new realtime infra | S |
| F38 | Message authorship byline on canvas | missing | `db`+`chat (authorUserId/personaId)` · `@rox/ui message.tsx` · canvas · `comms-core/identity` | Add author fields; optional `MessageHeader` byline (glyph F24 + name + lock) shown only when room multi-user. **Done:** byline in shared rooms, clean in solo | L |
| F27 | Org/team/members management panel | partial | `apps/desktop settings/{organization,members,teams}` · web parity · `trpc/organization` | Consolidate into one Workspaces management panel; **port to web**; lift shared to `@rox/ui`. **Done:** parity panel, no new core CRUD | M |
| F29 | Per-workspace + per-persona theming | missing | `@rox/ui globals.css` · ThemeProvider · apps · `db` | Independent CSS-var layers: org accent + persona accent (orthogonal). Persist accent columns. **Done:** switching org/persona retints, layers independent | L |
| F35 | Identity-aware authorship in tree (blame) | partial | `host-service git router (getBlame)` · `apps/desktop FilesTab` | Add `git.getBlame`; surface via wired no-op `renderRowDecoration`; author→identity via F24. **Done:** per-file last-author in tree | M |

**Gate 2:** presence + private/shared lock visible; message byline appears only in multi-user rooms; web has org/team management parity; per-org/per-persona accents layer independently.

### Phase 3 — Conversation organization & power search
**Goal:** complete tag/session organization + search.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F13 | `#tag`-in-title chips | missing | `@rox/chat/shared` parser · `@rox/ui` chips · `chatRouter` | Pure `#token` parser (alongside slash tokenizers); render chips; optional sync into `labels`. **Done:** chips click-to-filter | M |
| F14 | AI auto-title + auto-tag | partial | `@rox/chat title-gen` · `chatRouter` | Auto-title **done**; add `generateLabelsFromTranscript` (Mastra pattern), idle-reconcile via `learnedAt`. **Done:** 1-3 tags proposed, dismissible | M |
| F15 | Full-text message search + highlight | partial | `db tsvector` · `chatRouter searchMessages` · `@rox/ui` | Add `tsvector`/GIN on `content` + `searchMessages` (`websearch_to_tsquery`+`ts_headline`); keep instant title filter. **Done:** content search w/ highlight | L |
| F16 | Cross-entity faceted search | partial | new `trpc` search router · `db` · `@rox/ui` | Build search router (tsvector/trigram over chat/journal/task/drive, org_id denormalized) → typed facets (reuse `SearchScope`). **Done:** faceted results | L |
| F17 | Boolean multi-tag + saved views/smart folders | missing | `chatRouter` filter+views · `db chat_saved_views` · `@rox/ui rail` | Add `labelsAll/Any/status` params; `chat_saved_views` + CRUD; rail reuses `DashboardSidebar` section/DnD. **Done:** AND/OR/NOT filter + saved views + smart folders | L |
| F18 | Time-grouped session list | exists | `apps/desktop SessionSelector` → `@rox/ui` | Extract `groupSessionsByAge` to `@rox/ui`; point web/mobile at real `listSessions`. **Done:** grouping shared across surfaces | S |
| F19 | Pin/favorite + archive | partial | `db chat_sessions.pinned` · `chatRouter setPinned` · row/menu | Archive **done**; add `pinned` col + `setPinned` (mirror `setStatus`) + sticky-top render. **Done:** pin/archive from row menu | M |
| F20 | Rich session row | partial | `@rox/ui SessionRow` · desktop/web rows | Consolidate into ONE `@rox/ui SessionRow` + color dot(F12)/chips(F13)/pin-archive(F19). **Done:** single shared rich row | M |
| F49 | Conversation outline / scrollback rail | partial | `@rox/ui/ai-elements` · `apps/desktop MessageScrollbackRail` · `trpc/chat` | Consolidate desktop rail into `@rox/ui` (unlocks web/mobile); add cross-session recent-jump (needs `chat-recents` query). **Done:** outline + recents shared | M |

**Gate 3:** content+faceted search returns highlighted results; saved views/smart folders persist; pin/archive + rich row + grouping shared via `@rox/ui`.

### Phase 4 — Canvas, composer & command surfaces
**Goal:** polish conversation canvas + global control surfaces, cross-platform.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F39 | Activity worklog timeline | partial | `@rox/ui/ai-elements (ExploringGroup→ActivityWorklog)` | Generalize verb/summary mapper; persistent collapsible Activity timeline fed by `useChatDisplay`. **Done:** grouped tool-events one-line summary, expandable | M |
| F40 | Collapsible tool/thinking + expand-all | exists | `@rox/ui/ai-elements tool/reasoning` | Add `ToolGroup` context + expand-all/collapse-all toolbar. **Done:** global expand/collapse | S |
| F41 | Sticky-bottom auto-scroll | exists | `@rox/ui/ai-elements conversation.tsx` | Ensure web/mobile adopt the `Conversation` wrapper. **Done:** parity scroll behavior | S |
| F42 | Rich composer (context-ring + voice) | partial | `@rox/ui/ai-elements prompt-input/context` · `apps/desktop` | Wire `context.tsx` ring (`usedTokens/maxTokens`); lift shared voice hook + RN MicButton. **Done:** context ring mounted, voice cross-platform | M |
| F43 | Per-message actions | partial | `@rox/ui/ai-elements message.tsx` · desktop/web | Mount `MessageActions` (copy/regenerate/retry/edit via `session.sendMessage`); reuse `MessageBranch*`. **Done:** action row live | M |
| F44 | Extensible ⌘K palette | partial | `@rox/ui` · apps (desktop/web/mobile) | Lift `core/types.ts` (Command/Provider) to shared pkg; keep desktop modules as providers; add web (`cmdk` in Next) + mobile (RN sheet) hosts. **Done:** ⌘K on all surfaces | L |
| F45 | Slash-command system | partial | `@rox/chat` · `@rox/ui` · web/mobile | Reuse platform-neutral matcher in `@rox/chat/shared`; move FS discovery behind skill tRPC; shared slash-menu UI; merge with F44. **Done:** slash menu shared | M |
| F48 | Onboarding wizard + live probe | partial | `apps/desktop onboarding` · `@rox/ui` · `trpc` · web/mobile | Extract wizard shell to `@rox/ui`; generic probe contract in tRPC; gate Electron-only dep-install behind capability. **Done:** wizard on web/mobile (connect-only) | M |
| F33 | Inline multi-format preview | partial | `@rox/panes` preview pane · `apps/desktop FileViewerContent` | Wire `FilesTab onSelectFile` → panes preview (unpinned replace-in-place); extract viewer to shared; add `react-pdf`. **Done:** code/md/image/diff/pdf preview in right panel | L |

**Gate 4:** activity worklog + expand-all + context ring + per-message actions on desktop; ⌘K + slash shared; multi-format preview (incl. pdf) in right panel.

### Phase 5 — Platform reach, theming polish & motion
**Goal:** finish multiplatform parity + aesthetic polish.

| F | Feature | Status | Target packages | Task → Done | Eff |
|---|---|---|---|---|---|
| F05 | Responsive cascade (regions→drawers) | partial | `@rox/ui (use-mobile, drawer)` · web · desktop renderer | Add breakpoint tiers to `use-mobile`; drive 3-region collapse from shell (not panes). **Done:** phone reflow to drawers, 44px targets | L |
| F06 | Flicker-free first paint | partial | desktop main+renderer · web layout · `@rox/ui/motion` | Add pre-hydration theme/accent inline script in web layout; gate entrance behind `useShouldAnimate`. **Done:** no FOUC on web | M |
| F08 | Theme × Skin two-axis | partial | `@rox/ui` (extract shared theme model) · web · desktop | Lift `Theme` type + `UI_COLOR_TO_CSS_VAR` + `applyUIColors` to shared; **remove web `forcedTheme`**; reuse `animateThemeChange`. **Done:** Theme×Skin on web, mobile adapter | L |
| F09 | Native window-chrome theme-color sync | partial | web layout+`AppearanceProvider` · desktop window/glass | Drive dynamic `<meta theme-color>` from resolved `--background/--primary`. **Done:** chrome matches theme on web+desktop | M |
| F46 | Cross-device prefs sync | partial | `db` · `trpc` · `apps/desktop CollectionsProvider` | Add Electric-synced `user_preferences/org_settings` (org_id denormalized) + mutations + collections. **Done:** prefs/layout/locale sync cross-device | L |
| F47 | Profile-scoped skills/MCP/plugins | partial | `db` · `trpc/skill` · `mcp-v2` · desktop settings | Add `profile_skill_assignments/profile_mcp_servers` + MCP inventory router. **Done:** per-persona capability assignment | L |
| F50 | PWA / installable web + offline | missing | `apps/web (manifest + @serwist/next)` · `@rox/ui` | `app/manifest.ts` + Serwist SW + offline shell + web IndexedDB persistence adapter. **Done:** installable PWA, offline shell | M |
| F51 | Shared gesture-grammar tokens | partial | new `packages/motion-tokens` (lift) · `@rox/ui` · mobile | Lift gesture config to platform-neutral module; RN gesture wrappers (swipe-dismiss, pan-resize drawer). **Done:** shared swipe/pan tokens, reduced-motion honored | M |
| F52 | Multi-window / popout | missing | `apps/desktop main/windows` · `window-state` | Generalize `createWindow` → id-keyed factory + registry; route each window; rehydrate `@rox/panes` store from serialized `paneLayout`; per-window bounds. **Done:** tear-off windows from one core | L |
| F54 | View-transition panel scenes | missing | `@rox/ui/motion` · web · desktop shells | Shared `PanelScene` wrapper (View Transitions API where supported, `AnimatePresence` fallback, gated). **Done:** morphing panel transitions | L |
| F56 | Focus / Zen mode | partial | `apps/desktop focus-mode` · `@rox/ui` zen primitive · web/mobile | Add chrome-collapsing layout mode to 3-pane shell as shared hook/provider. **Done:** one-tap zen on all surfaces | M |
| F57 | AI-seeded empty states | missing | desktop+web empty-states · `trpc/sdk` suggestions · `@rox/ui` | Suggestions endpoint for context starter prompts; shared `EmptyState` primitive w/ seeded chips. **Done:** inviting empty states | M |
| F58 | i18n framework + locale catalog | missing | **NEW `packages/i18n`** · `@rox/ui` · apps · `trpc` | `@rox/i18n` (i18next/lingui across Next RSC + Electron + RN), typed `t()`, RTL, migrate 560+ RU files, persist locale (ties F46). **Done:** EN+RU runtime switch, RTL works | L |

**Gate 5:** web removed from mock (real tRPC, Theme×Skin, PWA); mobile token bridge + gestures; multi-window on desktop; i18n switch EN/RU; full motion polish; `main`-merge-ready (green Sherif/Lint/Typecheck/Test/Build).

---

## Cross-platform workstreams (run alongside phases)

- **WS-A · Shared-core lift:** for every `partial`/`exists` desktop feature, extract framework-agnostic logic/types into the shared package (`@rox/ui`, `@rox/chat`, `@rox/panes`, `@rox/shared`) before/while wiring surfaces.
- **WS-B · Web mock→real:** replace `apps/web` agents mock with real `chatRouter`/tRPC; remove `forcedTheme='dark'`; wire motion governor (F53), theme-color (F09), PWA (F50).
- **WS-C · Mobile token/component bridge:** since `apps/mobile` doesn't import `@rox/ui`, build RN adapters consuming shared tokens (motion, design, gesture) + RN hosts for switchers/palette/sheets.
- **WS-D · Net-new infra** (sequence early where it blocks features): `chat_labels`+`chat_saved_views` (F11/F17), `agent_personas` (F21/F29), message FTS (F15/F16), synced prefs (F46), `packages/i18n` (F58), multi-window factory (F52), PWA (F50), View Transitions (F54), gesture tokens (F51), MCP/profile assignment (F47).

---

## Conventions & guardrails (for the executor)

- **Run interface:** prefer `bun` + `turbo`. Typical: `bun install`, `turbo build`, `bun test`, `bunx biome check`. Use repo task surfaces (`package.json`, `turbo.jsonc`) — do not invent commands.
- **DB:** edit `packages/db/src/schema/*.ts` → `bunx drizzle-kit generate`; never hand-edit `drizzle/*`; enums append-only; stamp `organizationId` for Electric shapes.
- **Desktop:** extend V2 `@rox/panes`; never `react-mosaic`. tRPC subscriptions = observables, not async generators. Mind single-`BrowserWindow` (F52 changes this deliberately).
- **Motion:** token + `useShouldAnimate` + instant fallback; `tokens.ts` append-only.
- **Tests:** co-locate `*.test.tsx`; Biome warnings fail CI — keep it clean.
- **Identity/Tags orthogonality** is a review gate: any PR mixing the two axes is rejected.

---

## Open micro-decisions (resolve during execution, non-blocking)

1. `@rox/panes` split model: binary (`types.ts`) vs n-ary (README) — reconcile in Phase 0 (F04) before resize work.
2. Active-persona pointer: persist on `session` (mirror `activeOrganizationId`) vs dedicated client store (F22). Recommend: session, for cross-device.
3. `#tags` (F13) ↔ `labels` (F11): auto-sync `#token`→label, or keep `#tags` purely presentational? Recommend: opt-in sync.
4. i18n lib: i18next vs lingui (F58) — pick for best Next-RSC + Electron + RN support.
5. Mobile parity depth per phase: which features are "shared-core done" vs "RN-rendered done" at each gate (track in WS-C).

---

## Verification & handoff

- Per-phase gate must show: green `bun test` + `turbo build` + `biome check`, and **visual proof** (Peekaboo/Playwright screenshots) of the phase's surfaces on desktop (lead) — web/mobile proof as their workstream lands.
- Final merge to `main` requires the North-Star green set: Sherif · Lint · Typecheck · Test · Build · Build CLI×3 · Deploy DB (Neon).
- This plan is the source of truth; `CATALOG.md` is the feature reference; `GAP-MAP.md` is the brownfield evidence.
