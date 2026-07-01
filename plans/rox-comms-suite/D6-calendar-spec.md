## D6 — Calendar (Rox Comms Suite)

> Status: SPEC (no code). Owner sign-off required before any task lands.
> Domain: D6 (Calendar). Depends on D1 (Identity) and D3 (Email). Schema: additive only, all tables prefixed `cal_*` in `packages/db/src/schema/calendar.ts`. Migrations authored offline via `bunx drizzle-kit generate` — never `migrate`/`push` against prod.

---

### 1 Scope & user stories

D6 gives every Rox identity a first-class calendar that hangs off the rox username (D1). One calendar model, owned by Rox (not a Google/Outlook proxy), with ICS import/export so it interops with the rest of the world. Events support recurrence (RRULE, reusing `packages/shared/src/rrule.ts` already used by automations), attendees addressed by `username` or email, invites delivered through D3 email, reminders, and shared/team calendars. A read-only CalDAV server is a later, optional phase for external clients (Apple Calendar, Thunderbird).

**In scope (v1):**
- Personal calendars per user (auto-provisioned default calendar on identity creation).
- Events: title, location, description, all-day, timed, start/end, timezone, color, status (confirmed/tentative/cancelled), visibility (default/public/private).
- Recurrence via RRULE + EXDATE + per-occurrence overrides (RECURRENCE-ID semantics).
- Attendees by rox `username` (resolved to identity) or raw email; per-attendee RSVP (needs-action/accepted/declined/tentative).
- Invites + RSVP-update emails through D3 (`packages/email`, Resend), with valid `.ics` `METHOD:REQUEST`/`REPLY` attachments so external invitees can accept in their own client.
- ICS import (file upload → events) and ICS export (per-calendar feed + single-event `.ics`).
- Reminders (relative offsets, e.g. -10m, -1d) → in-app notification + optional email; delivery via the same scheduler that runs automation RRULEs.
- Shared/team calendars with an ACL (owner/writer/reader/free-busy).
- Free/busy lookup for scheduling (returns busy intervals only, respecting visibility).

**Out of scope (v1, parked for later phases):**
- Full two-way CalDAV (read-only first; write later).
- External Google/Microsoft account sync (separate connector domain).
- Meeting scheduling polls / "find a time" auto-solver (can layer on free/busy later).
- Resource/room booking.

**User stories**
1. As a user I open Calendar in web/desktop/mobile and see my events for the week; my timezone is respected.
2. As a user I create a recurring weekly standup and the next occurrences preview correctly (reuse `nextOccurrences`).
3. As a user I invite `@dana` and `ext@gmail.com`; `@dana` gets an in-app invite + email, `ext@gmail.com` gets an email with a working `.ics` they can accept in Apple Calendar.
4. As an invitee I RSVP "accepted"; the organizer sees my status update; an external RSVP `.ics REPLY` updates my row too.
5. As a user I edit one occurrence of a recurring event without changing the series ("this event only").
6. As a user I delete one occurrence (EXDATE) or the whole series.
7. As a user I import a `.ics` from another tool and my events appear; I export my calendar as a subscribable feed URL.
8. As a team admin I create a shared "Team" calendar, grant `@dana` writer and `@sam` reader.
9. As a user I get a reminder 10 minutes before a meeting (in-app + email).
10. As a user I publish a calendar as public so anyone with the link sees free/busy or full events (visibility-gated).
11. (Phase 5) As a user I subscribe to my Rox calendar from Apple Calendar over CalDAV read-only.

---

### 2 Target design

**ASCII architecture**

```
        ┌────────────────────────── Surfaces ──────────────────────────┐
        │  apps/web   apps/desktop   apps/mobile   (packages/chat slash) │
        │  /calendar  renderer route Expo screens   "/schedule" cmd      │
        └───────────────┬───────────────────────────────────────────────┘
                        │ tRPC (calendar router)
        ┌───────────────▼───────────────────────────────────────────────┐
        │  packages/trpc/src/router/calendar/                            │
        │   calendars · events · attendees · share · ics · freebusy      │
        └───┬───────────────┬───────────────┬──────────────┬────────────┘
            │               │               │              │
   ┌────────▼──────┐ ┌──────▼───────┐ ┌─────▼──────┐ ┌─────▼──────────┐
   │ rrule helper  │ │ D1 identity  │ │ D3 email   │ │ scheduler/     │
   │ shared/rrule  │ │ resolve user │ │ Resend +   │ │ reminder runner│
   │ (occurrences) │ │ → attendee   │ │ .ics attach│ │ (cron/queue)   │
   └───────┬───────┘ └──────────────┘ └────────────┘ └───────┬────────┘
           │                                                  │
   ┌───────▼──────────────────────────────────────────────────▼─────────┐
   │  packages/db/src/schema/calendar.ts  (Neon Postgres, additive)      │
   │  cal_calendars · cal_calendar_members · cal_events ·                 │
   │  cal_event_occurrences · cal_attendees · cal_reminders ·            │
   │  cal_ics_feeds                                                       │
   └─────────────────────────────────────────────────────────────────────┘
           ▲ ElectricSQL live-sync (cal_events / cal_attendees) → clients

   (Phase 5) apps/relay or apps/api route: read-only CalDAV (PROPFIND/REPORT)
             reads cal_* tables, emits VEVENT; auth via app password.
```

**Recurrence storage model.** Master event row holds the RRULE (string body, same dialect as `shared/rrule.ts`), `dtStart`, `dtEnd`/`durationMinutes`, and `timezone`. We do **not** materialize every occurrence. Exceptions are stored as `cal_event_occurrences` rows keyed by `recurrenceId` (the original occurrence instant): a "this-only" edit = override row; a delete = `cancelled` override (logical EXDATE). Range queries expand the master via `nextOccurrences` within the requested window and then apply overrides. `exdates` (jsonb array of ISO instants) is also kept on the master for fast EXDATE export.

**ERD (additive tables — all prefixed `cal_`)**

```
cal_calendars
  id              uuid pk default random
  organization_id uuid  not null → organizations.id (cascade)
  owner_user_id   uuid  not null → users.id (cascade)        -- D1 identity owner
  name            text  not null
  color           text  not null default '#3b82f6'
  timezone        text  not null default 'UTC'               -- IANA tz
  kind            cal_calendar_kind not null default 'personal' -- personal|team
  visibility      cal_visibility    not null default 'private'  -- private|busy|public
  is_default      boolean not null default false
  public_token    text  null unique                          -- share-link feed token (random)
  created_at      timestamptz not null default now
  updated_at      timestamptz not null default now
  INDEX (organization_id, owner_user_id)
  UNIQUE (owner_user_id) WHERE is_default                    -- one default per user
  INDEX (public_token) WHERE public_token IS NOT NULL

cal_calendar_members            -- shared/team ACL
  id              uuid pk
  calendar_id     uuid not null → cal_calendars.id (cascade)
  user_id         uuid not null → users.id (cascade)         -- D1 identity
  role            cal_member_role not null                   -- owner|writer|reader|freebusy
  created_at      timestamptz not null default now
  UNIQUE (calendar_id, user_id)
  INDEX (user_id)                                            -- "calendars shared with me"

cal_events
  id               uuid pk
  organization_id  uuid not null → organizations.id (cascade)
  calendar_id      uuid not null → cal_calendars.id (cascade)
  created_by       uuid not null → users.id
  title            text not null
  description      text null
  location         text null
  is_all_day       boolean not null default false
  dt_start         timestamptz not null                      -- real UTC instant
  dt_end           timestamptz null                          -- null when duration-based
  duration_minutes integer null                              -- for recurring/all-day
  timezone         text not null default 'UTC'               -- IANA tz for wall-clock + RRULE expansion
  rrule            text null                                 -- RFC5545 body (shared/rrule dialect)
  exdates          jsonb not null default '[]'               -- ISO UTC instants excluded
  status           cal_event_status not null default 'confirmed' -- confirmed|tentative|cancelled
  visibility       cal_visibility   not null default 'default'    -- default|public|private
  color            text null
  uid              text not null                             -- iCalendar UID (stable, export/import)
  sequence         integer not null default 0               -- iCal SEQUENCE (bump on edit → REQUEST)
  created_at       timestamptz not null default now
  updated_at       timestamptz not null default now
  UNIQUE (organization_id, uid)
  INDEX (calendar_id, dt_start)                              -- window range scan
  INDEX (organization_id, dt_start)

cal_event_occurrences           -- per-instance overrides of a recurring master
  id              uuid pk
  event_id        uuid not null → cal_events.id (cascade)
  recurrence_id   timestamptz not null                       -- original occurrence instant (RECURRENCE-ID)
  is_cancelled    boolean not null default false             -- logical EXDATE for this instance
  title           text null                                  -- null = inherit from master
  description     text null
  location        text null
  dt_start        timestamptz null                           -- moved instance
  dt_end          timestamptz null
  status          cal_event_status null
  created_at      timestamptz not null default now
  UNIQUE (event_id, recurrence_id)

cal_attendees
  id              uuid pk
  event_id        uuid not null → cal_events.id (cascade)
  user_id         uuid null → users.id                       -- set when attendee is a rox identity (D1)
  email           text not null                              -- canonical address (username@rox.one or external)
  display_name    text null
  role            cal_attendee_role not null default 'required' -- required|optional|chair
  rsvp_status     cal_rsvp_status   not null default 'needs_action' -- needs_action|accepted|declined|tentative
  is_organizer    boolean not null default false
  responded_at    timestamptz null
  created_at      timestamptz not null default now
  UNIQUE (event_id, email)
  INDEX (user_id)                                            -- "events I'm invited to"
  INDEX (event_id)

cal_reminders
  id              uuid pk
  event_id        uuid not null → cal_events.id (cascade)
  user_id         uuid null → users.id                       -- per-user reminder (null = event default)
  offset_minutes  integer not null                           -- minutes BEFORE start (e.g. 10)
  method          cal_reminder_method not null default 'app' -- app|email
  next_fire_at    timestamptz null                           -- precomputed next trigger (recurring-aware)
  last_fired_at   timestamptz null
  created_at      timestamptz not null default now
  INDEX (next_fire_at) WHERE next_fire_at IS NOT NULL        -- scheduler scan

cal_ics_feeds                   -- export/import provenance + subscribe tokens
  id              uuid pk
  calendar_id     uuid not null → cal_calendars.id (cascade)
  direction       cal_feed_direction not null               -- import|export
  token           text null unique                          -- subscribe URL token (export feeds)
  source_url      text null                                  -- remote .ics (future poll-import)
  last_synced_at  timestamptz null
  created_at      timestamptz not null default now
  INDEX (calendar_id)

-- pgEnums (new, in enums.ts):
cal_calendar_kind  : personal | team
cal_visibility     : default | private | public | busy
cal_member_role    : owner | writer | reader | freebusy
cal_event_status   : confirmed | tentative | cancelled
cal_attendee_role  : required | optional | chair
cal_rsvp_status    : needs_action | accepted | declined | tentative
cal_reminder_method: app | email
cal_feed_direction : import | export
```

**Identity reuse (D1).** Attendees and members reference `users.id`. To resolve a typed `@username` to a user, reuse the `user_profiles.handle` lookup (`packages/db/src/schema/profiles.ts` — `handle` is unique, route `rox.one/@<handle>`). External / cross-org attendees that are not rox users go through `resolveIdentity` (`identity_links`, `packages/db/src/schema/identity.ts`) so they become resolvable contact nodes — reusing the exact pattern mail/chat already use. `username@rox.one` addresses route back to the owning user via D3.

---

### 3 Providers / tech choices + tradeoffs

| Concern | Choice | Why / tradeoff |
|---|---|---|
| Recurrence engine | Reuse `packages/shared/src/rrule.ts` (rrule.js + `@date-fns/tz`) | Already battle-tested by automations; same RRULE dialect, correct DST/UTC math (`nextOccurrences`, `parseRrule`). Tradeoff: helper currently lacks `EXDATE`/`COUNT`/`UNTIL`-aware expansion in the preset matcher → extend it, don't fork. |
| ICS parse/serialize | `ical.js` (Mozilla) for parse, hand-built VEVENT serializer for export | `ical.js` is robust at messy real-world feeds. Serialize ourselves to keep VEVENT minimal and control UID/SEQUENCE/METHOD. Alt `ics` npm = simpler but weak on TZID/recurrence. |
| Invite delivery | D3 email (`packages/email`, Resend) | Resend already used for transactional mail; attach `.ics` (`METHOD:REQUEST`) so external clients render an accept button. No new provider. |
| Live updates | ElectricSQL on `cal_events` + `cal_attendees` | Same live-sync stack as chat; calendar grid updates without polling. Respect the cache-first `useLiveQuery` rule (AGENTS.md #9). |
| Reminder scheduler | Reuse the automation RRULE scheduler (cron/queue that already evaluates `next_fire_at`) | `apps/api/.../automations/evaluate` + existing rrule scheduling already does "compute next fire, run on tick." Extend it to also scan `cal_reminders.next_fire_at`. Avoids a second scheduler. |
| CalDAV (Phase 5) | **Embedded read-only CalDAV handler** in `apps/relay` or `apps/api`, NOT Radicale/Baikal | Radicale (Python) / Baikal (PHP) are standalone servers with their own storage — they would fork the source of truth away from Neon. A thin read-only CalDAV adapter (PROPFIND/REPORT → VEVENT from `cal_*`) keeps Neon authoritative. Tradeoff: more code than dropping in Baikal, but no data duplication, no second auth system, no second deploy. Compare table below. |
| Public sharing | `public_token` on `cal_calendars` + token feed on `cal_ics_feeds` | Mirrors D2/Drive share-link model; visibility gate (`busy` vs `public`) controls exposure. |

**CalDAV server options compared (Phase 5):**

| Option | Storage | Auth | Fit |
|---|---|---|---|
| Radicale | Own filesystem/DB | Own htpasswd | Poor — duplicates data, separate deploy |
| Baikal (sabre/dav) | Own MySQL/SQLite | Own users | Poor — second user table, PHP runtime |
| **Embedded read-only adapter (recommended)** | Neon `cal_*` (single source of truth) | Rox app-password / token | Best for v1 external read; write-CalDAV later |

---

### 4 Phased tasks (bite-sized; file paths; test approach — descriptions only, no code)

**Phase 0 — Schema & enums (S)**
- Add `cal_*` pgEnums to `packages/db/src/schema/enums.ts`.
- Create `packages/db/src/schema/calendar.ts` with the 7 tables above; export from `packages/db/src/schema/index.ts`.
- Run `bunx drizzle-kit generate --name="add_calendar_tables"` (offline). Do not apply to prod.
- Test: `bun test` schema-type inference; spin a Neon branch to apply + verify FKs/indexes/partial-unique constraints.

**Phase 1 — Recurrence helper extension (S)**
- Extend `packages/shared/src/rrule.ts`: add window expansion `occurrencesBetween({rrule, dtstart, timezone, from, to, exdates})` honoring `EXDATE`/`COUNT`/`UNTIL`.
- Test: extend `packages/shared/src/rrule.test.ts` — DST boundary, EXDATE removal, COUNT exhaustion, single-instance override merge.

**Phase 2 — tRPC calendar router (M)**
- Create `packages/trpc/src/router/calendar/{calendars,events,attendees,share,ics,freebusy}.ts` + index; register in router root (`packages/trpc/src/router/index.ts`).
- `calendars`: create/list/update/delete; auto-provision default calendar (hook into identity creation).
- `events`: create/update/delete (whole series), `updateOccurrence` (this-only override), `cancelOccurrence` (EXDATE), `listInWindow` (expand recurrence via Phase 1 helper + apply overrides).
- `attendees`: add (resolve `@handle` → `users.id` via `user_profiles`, else `resolveIdentity`), `setRsvp`, remove.
- `freebusy`: busy-interval query across calendars the caller may read.
- Mirror existing router conventions (org-scoped, zod input, auth context). Test: router unit tests with a Neon test branch; cover ACL (writer vs reader vs freebusy), recurrence expansion, RSVP transitions.

**Phase 3 — ICS import/export + invite email (M)**
- `ics` router: `export` (build VEVENT incl. RRULE/EXDATE/UID/SEQUENCE), `exportFeedToken` (public subscribe URL), `import` (parse via `ical.js`, map to events, dedupe by UID).
- Public feed HTTP route (`apps/api` or `apps/relay`) serving `text/calendar` for `cal_ics_feeds.token` and `cal_calendars.public_token` (visibility-gated).
- D3 invite hook: on create/update with attendees, enqueue email through `packages/email` with `.ics METHOD:REQUEST`; on RSVP, send `METHOD:REPLY`. Inbound RSVP `.ics` parsing → `setRsvp` (Phase 5-adjacent; v1 can rely on in-app RSVP for rox users + outbound REQUEST for externals).
- Test: round-trip import→export equality; invite email snapshot (subject/body/.ics attachment); UID-dedupe on re-import.

**Phase 4 — Reminders + scheduler integration (M)**
- `cal_reminders` CRUD in events router; compute `next_fire_at` (recurring-aware) on write.
- Extend the automation scheduler tick to scan `cal_reminders.next_fire_at <= now`, fire app notification + (if `method=email`) D3 email, then recompute next fire.
- Test: scheduler unit test (due reminder fires once, recomputes; recurring reminder rolls to next occurrence); timezone correctness.

**Phase 5 — Surfaces (M→L)**
- `apps/web/src/app/calendar/` — month/week/day grid + event modal; reuse shadcn/ui + Tailwind v4; ElectricSQL `useLiveQuery` (cache-first per AGENTS.md #9).
- `apps/desktop` renderer route mirroring web (shared components).
- `apps/mobile` Expo agenda/day screens (read + RSVP + create).
- `packages/chat` slash command `/schedule` → quick-create event from chat.
- Test: component tests co-located (`Calendar.test.tsx`); visual verification (Peekaboo) of grid + invite flow; mobile smoke.

**Phase 6 — CalDAV read-only (L, optional/parked)**
- Embedded CalDAV handler in `apps/relay`/`apps/api`: handle `PROPFIND`/`REPORT`/`GET`, emit VEVENT from `cal_*`; auth via Rox app-password.
- Test: connect from Apple Calendar + Thunderbird; verify events render, recurrence honored.

---

### 5 Effort & Risks

**Effort (rough):**
- Phase 0 Schema — **S** (~0.5 wk)
- Phase 1 RRULE extension — **S** (~0.5 wk)
- Phase 2 tRPC router — **M** (~1.5 wk)
- Phase 3 ICS + invites — **M** (~1.5 wk)
- Phase 4 Reminders/scheduler — **M** (~1 wk)
- Phase 5 Surfaces (web+desktop+mobile+chat) — **M→L** (~2.5 wk)
- Phase 6 CalDAV (optional) — **L** (~2 wk, deferrable)
- **Core v1 (P0–P5): ~7.5 weeks.** With CalDAV: ~9.5 weeks.

**Risks:**
- **Recurrence correctness / DST.** Highest-bug-density area. Mitigation: lean entirely on the proven `shared/rrule.ts` UTC/TZ model; exhaustive table-driven tests; never store wall-clock as UTC except in rrule.js input space (helper already enforces this).
- **ICS interop variance.** Real-world feeds are messy (broken TZID, vendor quirks). Mitigation: `ical.js` for parse, conservative VEVENT for export, UID-dedupe, fuzz with sample feeds from Google/Apple/Outlook.
- **Invite spam / abuse.** A user could blast invites to harvested emails. Mitigation: rate-limit invite sends per user/org; tie overage to **WS-E token economy** (charge tokens for outbound invite email beyond a free tier); require verified sender identity; Resend domain auth (SPF/DKIM/DMARC on rox.one via Cloudflare DNS).
- **Public share-link leakage.** Public calendar tokens expose data. Mitigation: visibility gate (`busy` hides details, only shows busy blocks); rotatable `public_token`; no enumerable IDs; default `private`.
- **Scheduler load / double-fire.** Reminders could fire twice or storm at scale. Mitigation: idempotent fire via `last_fired_at` guard + advisory lock on tick; reuse existing automation scheduler's proven dedupe.
- **CalDAV auth surface (Phase 6).** New external auth entrypoint. Mitigation: read-only first; scoped app-passwords (not main session); rate-limit; park until demand proven.
- **Cost.** Email volume (Resend) and scheduler ticks. Mitigation: batch reminder emails, free-tier + token-metered overage via WS-E, ElectricSQL push instead of polling.

---

### 6 Dependencies on other domains + Rox infra reused

**Hard dependencies:**
- **D1 Identity** — attendees/members resolve to `users.id`; `@username` via `user_profiles.handle`; external addresses via `identity_links`/`resolveIdentity`. Default calendar provisioned at identity creation.
- **D3 Email** — invite/RSVP delivery (`packages/email` + Resend); `username@rox.one` addressing; SPF/DKIM/DMARC on rox.one via Cloudflare-managed DNS.

**Soft / shared infra reused:**
- `packages/shared/src/rrule.ts` — recurrence engine (extend, don't fork).
- Automation scheduler (`apps/api/.../automations/evaluate` + rrule scheduling) — reused for reminders.
- ElectricSQL live-sync — `cal_events`/`cal_attendees` push to clients.
- `packages/db` Drizzle/Neon — additive `cal_*` schema; offline `generate` only.
- `packages/trpc` — router conventions, org-scoped auth context.
- shadcn/ui + Tailwind v4 — calendar surfaces.
- WS-E token economy — meter invite-email + (later) heavy export/CalDAV usage as overage.
- Share-link pattern (Drive/D2) — `public_token` parallels Drive public sharing.

**Provides to others:** free/busy lookup (for any future scheduling/meeting domain); event entities for the graph (can register as `entities` via knowledge core if desired).

---

### 7 Open questions for the owner

1. **Org vs personal scoping.** Calendars are org-scoped here (mirrors all existing schema). Confirm a personal calendar still lives under the user's primary org, not a separate "personal" namespace.
2. **Inbound RSVP from external clients.** v1 sends outbound `REQUEST` and lets rox users RSVP in-app. Do you want inbound `.ics REPLY` parsing (so Gmail "Accept" updates our row) in v1, or defer to the email-ingest pipeline?
3. **CalDAV priority.** Park Phase 6 entirely until a user asks, or build read-only CalDAV alongside v1 because you personally want Apple Calendar sync?
4. **Reminder free tier.** What's the free monthly invite/reminder-email allowance before WS-E token charges kick in?
5. **Public calendar default exposure.** When a user makes a calendar public, default to `busy` (privacy-safe) or `public` (full details)?
6. **Team calendar ownership transfer.** Should team calendars be owned by an org/team entity rather than a single `owner_user_id` (matters if the owner leaves)?
7. **Timezone source of truth.** Per-event `timezone` is stored; should the user's profile carry a default timezone (D1) to seed new events, and where does that live?
