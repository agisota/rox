# Rox Brownfield Gap-Map (58 features)

> Evidence from a parallel 8-agent map of the Rox monorepo against the borrow catalog.
> `exists` = wire/expose only · `partial` = extend existing · `missing` = build new. Effort S/M/L.

## Stack (definitive)

Bun 1.3 · Turbo 2.9 · Biome 2.4 (warnings fail CI).
- **Desktop = real surface:** Electron 40 · electron-vite · Vite 7 · React 19 · TanStack Router · Tailwind v4. tRPC via `trpc-electron` (subscriptions = observables). Panes: V2 `@rox/panes` (extend); `react-mosaic` legacy (don't). `frame:false` glass, single window.
- **Web = mock today:** Next.js 16 (`proxy.ts`) · React 19.2 · Tailwind v4 · shadcn from `@rox/ui` · motion 12 · next-themes `forcedTheme='dark'`.
- **Mobile = separate tokens:** Expo 56 · RN 0.85 · expo-router · `@rn-primitives` · `@expo/ui` · Uniwind (no `@rox/ui` import).
- **State:** zustand 5 + TanStack Query; cross-device = TanStack DB + ElectricSQL; `better-auth` session/active-org.
- **API:** tRPC v11; host FS/git via `host-service`/`@rox/workspace-client`.
- **Data:** Drizzle — `packages/db` (Neon, Electric) + `local-db` (SQLite) + `agent-state` (libSQL).
- **Styling:** Tailwind v4 + OKLCH tokens (`@rox/ui/globals.css`); desktop Theme×Skin store (Zed). Mobile tokens separate.
- **Motion:** `@rox/ui/motion` mature (tokens append-only, 45 primitives, `useShouldAnimate` governor + OS reduced-motion). No View Transitions.
- **Missing:** i18n framework (RU hardcoded), PWA on web.

## Reuse wins (why this is mostly extend, not build)

- `@rox/panes` — headless tabs+splits+pin/preview+DnD; V2 desktop workbench (F01/F03/F33/F52).
- `useV2WorkspacePaneLayout` + TanStack DB `v2WorkspaceLocalState` + Electric — cross-device persisted layout; new columns auto-sync (F04/F32/F46).
- `chat_sessions` + `chatRouter` — title/status(archive)/labels(tags)/lastActiveAt + CRUD already shipped (F10–F20 mostly UI).
- `@rox/collab` (Liveblocks, org-scoped rooms, `useOthers`) + `@rox/rtc` (LiveKit) + `PresenceStack` — presence with no new realtime infra (F37/F38).
- `better-auth` org model (orgs/members/teams/invitations + `activeOrganizationId` + `setActive` + Electric org_id filter) — multi-tenant + team DONE (F28); persona mirrors the pattern.
- `AgentsHeader`/`OrganizationDropdown` responsive switcher — template to fork for persona (F22) + personal/team workspace (F25/F26).
- `@rox/workspace-fs` (FsService) + `host-service` FS/git routers (relay-reachable from web) + `@pierre/trees` + `FilesTab` — file panel mostly built (F31/F32/F34).
- `@rox/ui/motion` — token layer + governor + `animateThemeChange` + signature primitives (F53/F55 basically exist).
- OKLCH tokens + desktop theme store + glass — theming foundation (F07/F08/F09/F25/F29).
- `DashboardSidebar` section system (sortable headers, DnD, color swatch, collapse-persist) — transplant as tag/saved-view rail (F11/F17/F19).
- `@rox/ui/ai-elements` (sticky-bottom Conversation, Tool/Reasoning collapsibles, MessageActions scaffold, prompt-input slash/@mention/context, ScrollbackRail) — canvas F39–F43/F49 extend-existing.
- `@rox/shared` pure-util pattern (co-located tests) — home for glyph/color (F24) + auto-color (F11).
- `@rox/trpc` + `@rox/sdk` — one backend for all three clients; new procedures extend existing routers.

## Net-new infra (genuinely new)

`agent_personas` + per-persona/per-workspace theme persistence (F21/F29) · `chat_labels` + `chat_saved_views` + rule evaluator (F11/F17) · message FTS tsvector/GIN + search router (F15/F16) · synced `user_preferences/org_settings` (F46) · `packages/i18n` + 560-file RU migration + RTL (F58) · multi-window factory/registry (F52) · PWA manifest+SW+IndexedDB (F50) · View Transitions scene abstraction (F54) · shared gesture-grammar tokens (F51) · MCP DB inventory + profile-scoped assignment (F47).

## Full gap table

| F | Feature | Status | Eff | Target packages | Integration note |
|---|---|---|---|---|---|
| F01 | Three-pane adaptive shell | partial | M | desktop `_dashboard/layout` · panes · ui | Formalize 3 resizable regions; reuse ResizablePanel; no shell pkg |
| F02 | Icon rail + active accent | partial | M | desktop DashboardSidebar · ui | Add ~52px rail mode + ActiveIndicator accent |
| F03 | 3-state right files panel ④ | partial | M | desktop v2-workspace → panes/workspace-client | Add peek snap to sidebar state machine (today 2-state) |
| F04 | Persisted resizable panes | exists | S | panes · useV2WorkspacePaneLayout | Reconcile binary vs n-ary split model first |
| F05 | Responsive cascade→drawers | partial | L | ui (use-mobile/drawer) · web · desktop | Blocks exist (vaul, sheet); add shell-level breakpoint cascade |
| F06 | Flicker-free first paint | partial | M | desktop · web layout · ui/motion | Add pre-hydration theme/accent script on web |
| F07 | Calm-console design tokens | exists | S | ui | Extend ramp + semantic tokens; add DESIGN-LANGUAGE.md |
| F08 | Theme × Skin two-axis | partial | L | ui (shared theme model) · web · desktop | Lift Theme model; remove web forcedTheme; mobile adapter |
| F09 | Native chrome theme-color sync | partial | M | web AppearanceProvider · desktop glass | Dynamic `<meta theme-color>` from resolved tokens |
| F10 | Colored tag pill-bar ① | missing | L | ui TagFilterPillBar · desktop ChatPane · chatRouter | Derive pills from labels; add labelsAny/All filter params |
| F11 | Tag color/icon studio + auto-color ① | missing | L | db chat_labels · trpc · ui | New chat_labels table; auto-color hash→palette (share F24) |
| F12 | Per-row color dot ① | missing | S | ui SessionRow · desktop/web rows | Dot from primary label color, flex-sibling |
| F13 | #tag-in-title chips | missing | M | chat/shared parser · ui · chatRouter | Pure #token parser; chips; optional sync to labels |
| F14 | AI auto-title + auto-tag | partial | M | chat title-gen · chatRouter | Auto-title done; add generateLabelsFromTranscript |
| F15 | Full-text msg search + highlight | partial | L | db tsvector · chatRouter searchMessages · ui | GIN on content + ts_headline; keep instant title filter |
| F16 | Cross-entity faceted search | partial | L | new trpc search router · db · ui | tsvector/trigram over chat/journal/task/drive → facets |
| F17 | Boolean multi-tag + saved views | missing | L | chatRouter · db chat_saved_views · ui rail | filter params + saved_views table + DnD rail |
| F18 | Time-grouped session list | exists | S | desktop SessionSelector → ui | Extract groupSessionsByAge; point web/mobile at real router |
| F19 | Pin/favorite + archive | partial | M | db chat_sessions.pinned · chatRouter · row | Archive done; add pinned col + setPinned + sticky-top |
| F20 | Rich session row | partial | M | ui SessionRow · desktop/web rows | Consolidate to one shared row + dot/chips/pin |
| F21 | Dual-identity card ② | partial | L | db agent_personas · trpc identity · ui | Human half exists; add persona table + DualIdentityCard |
| F22 | Identity/persona switcher chip ② | partial | M | web AgentsHeader · ui · session | Fork org switcher; add active-persona pointer |
| F23 | Identity detail card in dropdown ② | partial | M | web settings/identity · ui | Lift IdentitySettings → ProfileDetailCard |
| F24 | Deterministic glyph/color | missing | M | shared/identity-glyph · ui/Avatar | Pure hash→HSL+glyph; Avatar seed; shared w/ F11 |
| F25 | Personal-vs-team switcher + retint ③ | partial | M | desktop OrganizationDropdown · mobile · ui · db | Derive isPersonal; group; add accent_color → --workspace-accent |
| F26 | Searchable workspace switcher ③ | partial | S | desktop OrganizationDropdown · ui | Swap list for cmdk Command over collections.organizations |
| F27 | Org/team/members panel | partial | M | desktop settings · web parity · trpc/organization | Consolidate + port to web; lift shared to ui |
| F28 | Multi-tenant org root | exists | S | db auth · auth · trpc/organization | Reuse as-is; add web-parity switcher only |
| F29 | Per-workspace/per-persona theming | missing | L | ui globals · ThemeProvider · apps · db | Independent CSS-var layers org+persona accents |
| F30 | Panel header + Files/Artifacts/Todos tabs ④ | partial | M | desktop WorkspaceSidebar | Add Artifacts+Todos tabs + breadcrumb |
| F31 | IDE file-tree (icons+size) ④ | exists | S | desktop FilesTab (@pierre/trees) → ui | Surface size via renderRowDecoration + getMetadata |
| F32 | Lazy-expand + live sync + persist | partial | M | desktop FilesTab · v2WorkspaceLocalState | Persist expandedDirs; optional depth-1 prefetch |
| F33 | Inline multi-format preview | partial | L | panes preview · desktop FileViewerContent | Wire onSelectFile→panes; extract viewer; add react-pdf |
| F34 | In-tree CRUD + drag-upload + cruft ④ | exists | S | desktop FilesTab | Wire intra-tree row drag-move (movePath) |
| F35 | Identity-aware tree blame | partial | M | host-service git (getBlame) · desktop FilesTab | Add git.getBlame; surface via renderRowDecoration |
| F36 | Identity status line | missing | S | ui IdentityStatusLine · web/mobile shell | Presentational: human + persona + org |
| F37 | Member avatars + presence + lock | partial | S | ui PresenceStack · collab · web rooms | Presence ships; add RoomVisibilityBadge (private/shared) |
| F38 | Message authorship byline | missing | L | db+chat (authorUserId/personaId) · ui message · canvas | Byline only when room multi-user |
| F39 | Activity worklog timeline | partial | M | ui/ai-elements (ExploringGroup→ActivityWorklog) | Generalize verb mapper; persistent collapsible timeline |
| F40 | Collapsible tool/thinking + expand-all | exists | S | ui/ai-elements tool/reasoning | Add ToolGroup context + expand-all toolbar |
| F41 | Sticky-bottom auto-scroll | exists | S | ui/ai-elements conversation | Ensure web/mobile adopt Conversation wrapper |
| F42 | Rich composer (context-ring + voice) | partial | M | ui/ai-elements prompt-input/context · desktop | Wire context ring; lift voice hook + RN MicButton |
| F43 | Per-message actions | partial | M | ui/ai-elements message · desktop/web | Mount MessageActions (copy/regen/edit); reuse MessageBranch |
| F44 | Extensible ⌘K palette | partial | L | ui · desktop/web/mobile | Lift Command/Provider to shared; web cmdk + mobile sheet hosts |
| F45 | Slash-command system | partial | M | chat · ui · web/mobile | Reuse neutral matcher; FS discovery behind tRPC; shared menu |
| F46 | Cross-device prefs sync | partial | L | db · trpc · desktop CollectionsProvider | Electric-synced user_preferences/org_settings tables |
| F47 | Profile-scoped skills/MCP/plugins | partial | L | db · trpc/skill · mcp-v2 · desktop settings | profile_skill_assignments/_mcp_servers + MCP inventory |
| F48 | Onboarding wizard + live probe | partial | M | desktop onboarding · ui · trpc · web/mobile | Extract wizard shell; generic probe contract; gate dep-install |
| F49 | Conversation outline rail | partial | M | ui/ai-elements · desktop ScrollbackRail · trpc | Consolidate rail to ui; add cross-session recent-jump |
| F50 | PWA installable + offline | missing | M | web (manifest + @serwist/next) · ui | manifest + Serwist SW + offline shell + IndexedDB adapter |
| F51 | Shared gesture-grammar tokens | partial | M | new motion-tokens · ui · mobile | Lift gesture config; RN wrappers (swipe-dismiss, pan-resize) |
| F52 | Multi-window / popout | missing | L | desktop main/windows · window-state | id-keyed window factory + registry; rehydrate panes store |
| F53 | Motion tokens + governor | exists | S | ui motion · web | Wire web setMotionPreferenceSource + useShouldAnimate |
| F54 | View-transition panel scenes | missing | L | ui/motion · web · desktop | Shared PanelScene (VT API + AnimatePresence fallback) |
| F55 | Signature motion set | exists | S | ui motion | Append Hermes moments as primitives |
| F56 | Focus / Zen mode | partial | M | desktop focus-mode · ui · web/mobile | Add chrome-collapsing layout mode as shared hook |
| F57 | AI-seeded empty states | missing | M | desktop/web empty-states · trpc/sdk · ui | Suggestions endpoint + shared EmptyState w/ seeded chips |
| F58 | i18n framework + locales | missing | L | NEW packages/i18n · ui · apps · trpc | i18next/lingui across RSC+Electron+RN; RTL; migrate 560+ RU |

## Data model deltas (summary)

**ADD:** `chat_labels`(org,name,color,icon,seed) · `chat_saved_views`(org,createdBy,name,rule,color) · `agent_personas`(ownerUserId,org,displayName,avatarUrl,handle,accentColor,theme) · `user_preferences`/`org_settings` (Electric, org_id denormalized) · `profile_skill_assignments`/`profile_mcp_servers`.
**ALTER:** `chat_sessions` +pinned/pinnedAt · `chat_messages` +authorUserId+personaId+tsvector(GIN) · `organizations` +accent_color · `agent_personas` +accent/theme · `v2WorkspaceLocalState` +expandedDirs · `v2UserPreferences` +rightPanel-peek.
**Pure util (no DB):** `@rox/shared` glyph/color generator (F24/F11).
Workflow: edit `packages/db/src/schema/*.ts` → `bunx drizzle-kit generate`; enums append-only; stamp `organizationId`.
