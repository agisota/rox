## D7 — Notes (Rox Notebooks, Collaborative + Public)

> Part of the Rox Comms Suite. One identity = the rox username (`user_profiles.handle`). Notes is the
> "writing surface" sibling of mail / chat / calendar / drive, hung off the same identity. This spec is
> **additive-only** to `packages/db/src/schema` and **reuses** the existing knowledge/notebook, public-share,
> access-grant, and collab (LiveBlocks / WS-L) machinery rather than building a parallel stack.

---

### 1 Scope & user stories

**Critical framing (reuse vs new).** The repo already ships most of a notes engine:

| Already in repo | What it is | Decision for D7 |
|:--|:--|:--|
| `knowledge_documents` (`packages/db/src/schema/knowledge.ts`) | Org-scoped MDX notes/PRDs/specs with `slug`, `title`, `markdown`, `frontmatter`, `body` (jsonb), `tags[]`, `sourceKind`, `v2ProjectId`, `createdByUserId`. tRPC `knowledgeRouter` (list/get/search/create/update/delete/backlinks). | **REUSE as the note row.** A "note" is a `knowledge_documents` row of `type='note'`. Do **not** create a parallel `notes` table. |
| `knowledge_links` | Materialized `[[wikilink]]` edges → backlinks (resolved/unresolved). `syncOutgoingLinks` / `resolveIncomingLinks` in `knowledge/backlinks.ts`. | **REUSE as backlinks.** Already does exactly what D7 needs. |
| `public_shares` + `/s/[slug]` route (`apps/web/src/app/s/[slug]/page.tsx`) + `shareRouter` | Public link sharing for `chat_session` \| `artifact` with slug, payload, `revokedAt`. | **EXTEND**: add `note` (+ `notebook`) to `publicShareResourceTypeValues`; reuse `createPublicShare`/`getPublic`/`revokePublic` verbatim. |
| `access_grants` + `shareRouter.grant/revoke/list` | Role ACL (`viewer/editor/...`) on `project\|workspace\|host` for `user\|team\|organization`. | **EXTEND**: add `note` (+ `notebook`) to `accessResourceTypeValues` for per-user / shared (org/team) collaboration. |
| `@rox/collab` (LiveBlocks, WS-L: `collab.authRoom`) + `@rox/rtc` (LiveKit) | Presence + Yjs storage rooms, room-auth tRPC. | **REUSE** for real-time collaborative editing. Room id = `note:<noteId>`. |
| `journal_entries` / `journal_events` / `memory_items` | AI daily reflection, continuous event stream, curated memory. | **RELATE, do not merge.** These are *AI-authored* lanes; Notes is the *human-authored* lane. Cross-link via `sourceRef` and optional backlinks (see §6). |
| WS-J `dashboard` (skill libraries / collaborative board) | Org board surface. | **RELATE**: a note can be pinned into a dashboard section; no schema overlap. |
| `#293` Obsidian/react-flow canvas (`ai-elements/canvas.tsx`, `ViewCanvasPlaceholder`) | Node/edge canvas. | **RELATE (later)**: a note is a candidate canvas node; out of scope for D7-p1. |

**The only genuinely new concept D7 adds is the NOTEBOOK** (a named, ordered, ownable container that groups notes) plus a thin **note-membership** edge, **per-note collaborator presence metadata**, and the **share-type extensions**. Everything else is reuse.

**User stories**
- As a user I create a **personal note** (markdown, tags, `[[backlinks]]`) under my identity; it autosaves.
- As a user I organize notes into **notebooks** (e.g. "Journal Drafts", "Specs", "Meeting Notes"); a note can live in 0..N notebooks.
- As a user I **invite a teammate** (by handle) to a note or a whole notebook as `viewer`/`editor`; we **edit together live** (cursors, presence, Yjs).
- As a user I **publish a note publicly** → get a `rox.one/s/<slug>` link (read-only snapshot or live), and **revoke** it.
- As a user I **search** my notes by title/body/tag and traverse backlinks.
- As a user my **AI journal/memory can reference a note** and a note can reference a memory item, without the two stores fighting.
- As an org admin I can see/revoke all public shares and ACL grants in the org.

**Out of scope (D7-p1):** rich block editor schema design (use MDX + LiveBlocks Yjs), canvas placement (#293), note→email/calendar embeds (other comms domains), offline mesh sync (bitchat concepts), per-block comments.

---

### 2 Target design

```
                          ┌─────────────────────────────────────────────────────┐
                          │  IDENTITY: user_profiles.handle  (one username)       │
                          └───────────────┬─────────────────────────────────────┘
                                          │ createdByUserId / createdBy
        ┌─────────────────────────────────┼──────────────────────────────────────┐
        │                                  │                                       │
   ┌────▼─────────┐   member edge    ┌─────▼────────────────┐   backlinks   ┌──────▼──────┐
   │ note_books   │◄────────────────►│ knowledge_documents  │◄─────────────►│ knowledge_  │
   │ (NEW)        │  note_book_items │ (REUSE, type='note') │  (REUSE)      │ links       │
   └────┬─────────┘   (NEW edge)     └─────┬────────────────┘               └─────────────┘
        │                                  │
        │ ACL via access_grants            │ ACL + live edit
   ┌────▼──────────────┐             ┌─────▼───────────────────┐        ┌─────────────────┐
   │ access_grants      │            │ @rox/collab (LiveBlocks) │        │ public_shares   │
   │ (+'note',          │            │  room = note:<noteId>    │        │ (+'note',       │
   │  +'notebook')      │            │  presence + Yjs storage  │        │  +'notebook')   │
   └───────────────────┘             └─────────────────────────┘        └────────┬────────┘
        per-user / team / org              live collaboration                     │ /s/<slug>
                                                                          ┌────────▼────────┐
        AI lanes (RELATE, not merge):                                     │ apps/web /s/    │
        journal_entries · journal_events · memory_items ──sourceRef──►    │ public viewer   │
                                                                          └─────────────────┘

  Surfaces:
   web  apps/web/src/app/(dashboard)/notes/**        (notebook list, note editor, share)
   web  apps/web/src/app/s/[slug]/                    (REUSE public viewer; add 'note' render)
   web  apps/web/src/app/u/[handle]/  ProfileTabs     (RELATE: public-notes tab — published only)
   mobile apps/mobile/.../notes (read + light edit, cache-first useLiveQuery)
   desktop apps/desktop (renders web surface)
   trpc packages/trpc/src/router/notes/**            (notebook CRUD + membership; note CRUD via knowledgeRouter)
```

**ERD — additive tables (prefix `note_`).** Convention mirrors `knowledge.ts` exactly (org cascade FK, user FK,
timezone timestamps, named indexes). Schema files live in `packages/db/src/schema/`; migrations via
`bunx drizzle-kit generate` (offline). **No new note *content* table** — content is `knowledge_documents`.

**`note_books`** — named container, owned by a user, scoped to an org. New file `packages/db/src/schema/notes.ts`.

| column | type | notes |
|:--|:--|:--|
| `id` | uuid PK default random | |
| `organization_id` | uuid NOT NULL → `organizations.id` ON DELETE cascade | org scope (Electric per-user shape) |
| `created_by` | uuid NOT NULL → `users.id` ON DELETE cascade | owner identity |
| `slug` | text NOT NULL | unique per (org, created_by) |
| `title` | text NOT NULL | |
| `description` | text NULL | |
| `icon` | text NULL | emoji / lucide name |
| `is_default` | boolean NOT NULL default false | the user's inbox notebook |
| `sort_order` | integer NOT NULL default 0 | manual ordering |
| `created_at` / `updated_at` | timestamptz NOT NULL ($onUpdate) | |

Indexes: `note_books_org_idx(organization_id)`, `note_books_owner_idx(created_by)`,
`uniqueIndex note_books_owner_slug_uniq(organization_id, created_by, slug)`.

**`note_book_items`** — ordered membership edge (note ∈ notebook), many-to-many.

| column | type | notes |
|:--|:--|:--|
| `id` | uuid PK default random | |
| `organization_id` | uuid NOT NULL → `organizations.id` cascade | denormalized for Electric filtering |
| `note_book_id` | uuid NOT NULL → `note_books.id` ON DELETE cascade | |
| `document_id` | uuid NOT NULL → `knowledge_documents.id` ON DELETE cascade | the note (REUSED row) |
| `sort_order` | integer NOT NULL default 0 | position within notebook |
| `added_by` | uuid NULL → `users.id` ON DELETE set null | |
| `created_at` | timestamptz NOT NULL | |

Indexes: `note_book_items_book_idx(note_book_id, sort_order)`, `note_book_items_doc_idx(document_id)`,
`uniqueIndex note_book_items_book_doc_uniq(note_book_id, document_id)`.

**Enum extensions (append-only, never reorder) in `packages/db/src/schema/enums.ts`:**
- `publicShareResourceTypeValues`: append `"note"`, `"notebook"`.
- `accessResourceTypeValues`: append `"note"`, `"notebook"`.

**Reuse without change:** `knowledge_documents` (the note), `knowledge_links` (backlinks), `public_shares`,
`access_grants`. No column added to existing tables — purely enum-value appends + two new tables.

> **Why no `notes` table?** Adding one would duplicate `knowledge_documents`' slug/title/markdown/tags/backlinks
> and split search, sharing, and Obsidian import across two stores. A `type='note'` discriminator on the existing
> table is the minimal, reversible choice and inherits backlinks + MDX-safety (`assertMdxSafe`) for free.

---

### 3 Providers / tech choices + tradeoffs

| Concern | Choice | Why / tradeoff |
|:--|:--|:--|
| Note content store | **Reuse `knowledge_documents`** (Neon) | Single source of truth; inherits backlinks, tags, search, MDX-safety, Obsidian import. Tradeoff: must filter notebook surfaces by `type='note'` to avoid showing specs/PRDs. |
| Real-time collab | **`@rox/collab` (LiveBlocks Yjs + presence)** room `note:<id>` | Already merged (WS-L `collab.authRoom`). Yjs gives CRDT merge + offline buffer; presence gives cursors. Tradeoff: LiveBlocks is paid per-MAU — gate live mode behind `editor` ACL + a feature flag; fall back to last-write-wins autosave for solo notes (no room needed). |
| Persistence of collab edits | **Periodic flush of Yjs doc → `knowledge_documents.markdown`** via existing `update` mutation | Keeps Neon authoritative for search/share/export; LiveBlocks is the live layer, not the system of record. Tradeoff: needs a debounce/flush worker (web route or host). |
| Public sharing | **Reuse `public_shares` + `/s/[slug]`** | Slug allocation, revoke, org-admin listing, 2 MB payload cap all exist. Two modes: **snapshot** (copy markdown into `payload` — cheap, immutable) or **live** (payload stores `{noteId}`, viewer re-fetches published version). Default: snapshot for p1; live mode = p2. |
| ACL (shared, non-public) | **Reuse `access_grants`** | `viewer`/`editor` roles, user/team/org grantees, admin-gated. Editor role unlocks the LiveBlocks room. |
| AI lanes relationship | **`sourceRef` cross-links, not merge** | journal/memory stay AI-authored; a note can carry `sourceRef.memoryItemId` / `sourceRef.journalDay`, and a memory/journal item can deep-link to a note slug. No FK coupling → either side deletable. |
| Mobile | **TanStack DB `useLiveQuery` (cache-first)** per AGENTS.md rule #9 | Render persisted note rows immediately; `isReady` only gates empty/not-found. |
| Search | **Reuse `knowledgeRouter.search`** (ILIKE) for p1; **pg trgm / FTS index** as p2 | ILIKE is good enough at low volume; add `GIN` index on `to_tsvector(title‖markdown)` when notes scale. |

---

### 4 Phased tasks (no code — descriptions + paths + tests)

**Phase 0 — schema (S, additive).**
- T0.1 Append `"note"`,`"notebook"` to `publicShareResourceTypeValues` and `accessResourceTypeValues` in `packages/db/src/schema/enums.ts` (end of array, never reorder).
- T0.2 New `packages/db/src/schema/notes.ts`: `note_books`, `note_book_items` (per ERD §2), mirroring `knowledge.ts` style; export insert/select types.
- T0.3 Barrel: add `export * from "./notes"` to `packages/db/src/schema/index.ts`; add relations in `relations.ts` (notebook↔items↔document).
- T0.4 Run `bunx drizzle-kit generate --name="add_notebooks_and_note_share_types"` (offline only — never migrate/push).
- *Test:* `bun test packages/db` snapshot/typecheck; assert enum arrays are append-only (length grew, prefix unchanged).

**Phase 1 — notebook tRPC (M).** New `packages/trpc/src/router/notes/` (`notes.ts`, `schema.ts`, `index.ts`), registered in `packages/trpc/src/root.ts` (append after existing routers).
- T1.1 `noteBook.list/create/update/delete/reorder` — org+owner scoped via `requireActiveOrgMembership`; auto-create `is_default` inbox on first call.
- T1.2 `noteBook.addNote/removeNote/reorderNotes` — manage `note_book_items`; validate the `document_id` is `type='note'` and visible to the caller.
- T1.3 `note.create/update` thin wrappers (or direct `knowledgeRouter` reuse) forcing `type='note'`, returning the doc; backlinks handled by existing `syncOutgoingLinks`.
- *Test (TDD):* router unit tests with a seeded org/user (pattern of `share.test.ts`): create notebook → add note → list → reorder → ACL denial for non-member.

**Phase 2 — collaboration (M).**
- T2.1 ACL: extend `shareRouter.grant/revoke/list` callers to accept `resourceType: 'note'|'notebook'`; add a resolver that maps a notebook grant → effective access on its member notes.
- T2.2 LiveBlocks: derive room id `note:<id>`; gate `collab.authRoom` so only `editor`+ grantees (or owner) get write, `viewer` gets read presence; behind `NOTES_LIVE` feature flag.
- T2.3 Flush worker: debounced job (web route `apps/web/src/app/api/notes/flush` or host) that writes the Yjs doc text back to `knowledge_documents.markdown` via `note.update`.
- *Test:* authRoom returns no token for non-grantee; editor grant unlocks room; flush idempotency (same content → no churn).

**Phase 3 — public sharing (S).**
- T3.1 `shareRouter.publishNote` (mirror `publishArtifact`): snapshot `{type:'note', note:{slug,title,markdown,tags,publishedAt}}` into `public_shares.payload`, `resourceType:'note'`. Reuse `createPublicShare`/`getPublic`/`revokePublic`.
- T3.2 `apps/web/src/app/s/[slug]/page.tsx`: add a `note` payload renderer (MDX → read-only).
- *Test:* publish → `getPublic` returns payload; revoke → 404; payload > 2 MB rejected (existing guard).

**Phase 4 — surfaces (L).**
- T4.1 Web: `apps/web/src/app/(dashboard)/notes/**` — notebook sidebar, note editor (MDX + LiveBlocks when live), tag filter, backlink panel (reuse `knowledgeRouter.backlinks`), share dialog (reuse `ProfileShareButton`-style pattern).
- T4.2 Web public profile: optional "Notes" tab in `apps/web/src/app/u/[handle]/components/ProfileTabs` listing only that user's **published** notes.
- T4.3 Mobile: `apps/mobile` notes list + read + light edit, `useLiveQuery` cache-first.
- T4.4 Desktop: renders the web surface (no extra work beyond nav entry).
- *Test:* Playwright e2e — create note, add backlink, publish, open `/s/<slug>` incognito (evidence: screenshot + trace per Playwright Evidence Protocol); mobile cache-first render test.

**Phase 5 (p2, deferred):** live public mode, canvas node placement (#293), per-block comments, FTS index, note→calendar/email embeds.

---

### 5 Effort & Risks

**Effort (rough, solo):**
- Phase 0 schema — **S** (~0.3 wk)
- Phase 1 notebook tRPC — **M** (~0.7 wk)
- Phase 2 collaboration — **M** (~1 wk, LiveBlocks flush worker is the unknown)
- Phase 3 public sharing — **S** (~0.3 wk, mostly reuse)
- Phase 4 surfaces — **L** (~1.5–2 wk across web/mobile)
- **Total ≈ 4–5 weeks** for p1; p2 separate.

**Risks (incl. abuse / spam / security / cost):**
- **Cost — LiveBlocks MAU billing.** Live mode is paid per monthly-active user. *Mitigation:* solo notes never open a room (last-write-wins autosave); live mode gated by `editor` ACL + `NOTES_LIVE` flag; meter into WS-E token economy if it grows.
- **Public-share abuse / spam / illegal content.** Anonymous `/s/<slug>` links can host arbitrary markdown. *Mitigation:* reuse existing 2 MB cap + `assertMdxSafe` (XSS/script sanitization on note content); add rate-limit on `publishNote`; org-admin revoke already exists; add an abuse-report link on `/s/` and a `revokedAt` kill switch.
- **ACL leakage via notebook→note inheritance.** A notebook grant must not silently expose a note shared elsewhere. *Mitigation:* compute *effective* access = union of direct note grants + notebook grants; deny-by-default; cover with explicit denial tests.
- **Two-store drift (LiveBlocks vs Neon).** If the flush worker fails, the live doc and the searchable/exported copy diverge. *Mitigation:* Neon is system of record; flush is idempotent + retried; export/search always read Neon; show "syncing" indicator when room is ahead.
- **Slug enumeration.** *Mitigation:* `randomBytes(9).base64url` slugs (already used) are unguessable; keep min length.
- **`type='note'` bleed.** Notebook queries must always filter `type='note'`, else PRDs/specs appear. *Mitigation:* enforce in router, not UI; test.
- **Migration safety.** Enum value appends + 2 new tables are additive; **never** `migrate`/`push` to prod (offline `generate` only).

---

### 6 Dependencies on other domains + Rox infra reused

**Reuses (no new infra):**
- `packages/db` Neon schema — `knowledge_documents`, `knowledge_links`, `public_shares`, `access_grants` (+ enum appends + 2 tables).
- `packages/trpc` — `knowledgeRouter` (note CRUD + backlinks + search), `shareRouter` (grant/revoke/publish/getPublic/revokePublic), `requireActiveOrgMembership`, `verifyOrgAdmin`.
- `@rox/collab` (LiveBlocks, WS-L `collab.authRoom`) + `@rox/rtc` (LiveKit, optional voice on a shared note).
- `apps/web/src/app/s/[slug]` public viewer + `/u/[handle]` profile (ROX-522 identity).
- ElectricSQL per-user shape (org+user scoping) for live note/notebook lists.
- Obsidian import (`integration/obsidian`) already feeds `knowledge_documents` → notes appear automatically.

**Depends on / relates to:**
- **ROX-522 identity** — notebooks & notes hang off `user_profiles.handle` (owner identity, public profile tab).
- **WS-L collab/rtc** — must be merged (it is) for live editing.
- **WS-E token economy** — only if live-collab/storage metering is later required (overage billing); not a p1 blocker.
- **D-mail / D-calendar (sibling comms domains)** — future note embeds (link a note into an email or event); deferred to p2.
- **journal / memory** — *relate only* via `sourceRef` cross-links; no schema coupling.
- **#293 canvas** & **WS-J dashboard** — a note can later be a canvas node / pinned dashboard card; p2.

---

### 7 Open questions for the owner

1. **Note vs document UX boundary:** should the Notes surface show *all* `knowledge_documents` (incl. PRDs/specs/imported Obsidian) filtered by type, or only `type='note'` rows? (Affects whether "Notes" and "Knowledge/Docs" are one nav entry or two.)
2. **Public share default mode:** snapshot (immutable copy, cheapest, safest) vs live (always-current published version)? Recommend snapshot for p1.
3. **Live collaboration scope:** turn on LiveBlocks for any shared note, or only when 2+ active editors are present (cost control)? Recommend lazy room-open on second editor.
4. **Public notes on the profile:** do you want a `rox.one/@handle` "Notes" tab listing published notes (blog-like), or keep all sharing link-only? 
5. **Notebook = personal only, or org/team-owned too?** Spec assumes personal-owned notebooks shareable via ACL; an org-owned "team wiki" notebook is a small extension if desired.
6. **Org model:** identity is per-user but rows are org-scoped — for a solo user is there a personal "default org", and should public notes show org or just handle?
