## WS-I: Email RU Translation + Refresh — Spec

> Read-only discovery is complete. This spec defines the Phase-2 implementation to translate all
> `@rox/email` templates to Russian and actualize their content (notably retiring/repurposing the
> Stripe-era billing templates given the prepaid Rox token economy). Owner-confirmed RU is the
> primary product locale (Victor Mono / RU North Star). File ownership is strictly `packages/email/**`.

---

### 1. Findings (every question answered, with file:line evidence)

#### 1.1 Layout components & scripts the package uses

- **`StandardLayout`** — `packages/email/src/components/layout/StandardLayout/StandardLayout.tsx:20-62`. Wraps every transactional template: `<Html><Head/><Tailwind .../><Body><Preview/><Container><Logo/><divider><children><Footer/></Container></Body>`. Configures an inline Tailwind theme (`StandardLayout.tsx:24-37`) mapping `background/foreground/primary/muted/border` from `lib/colors`.
- **`Footer`** — `packages/email/src/components/layout/StandardLayout/components/Footer/Footer.tsx:8-102`. Renders footer logo (`logo-full.png`), social icons (X `x.com/rox_sh`, Instagram `instagram.com/rox`, LinkedIn `linkedin.com/company/agisota`), a **tagline** (`Footer.tsx:69` = "Run dozens of Claude Code, Codex, or any other in parallel."), legal links (Privacy/Terms/Contact, `Footer.tsx:73-94`), and copyright (`Footer.tsx:97-99` = "© {year} Rox. All rights reserved."). Image/link URLs derive from `env.NEXT_PUBLIC_MARKETING_URL`.
- **`Button`** — `packages/email/src/components/ui/Button/Button.tsx:10-21`. `primary`/`secondary` variants; text passed as children (no hardcoded copy).
- **`Logo`** — `packages/email/src/components/ui/Logo/Logo.tsx:7-15`. Header `logo.png`, no copy.
- **`lib/colors`** — `packages/email/src/lib/colors.ts:6-22`. Email-safe palette (light mode). No copy.
- **`lib/env`** — `packages/email/src/lib/env.ts:4-18`. `@t3-oss/env-core` exposing `NEXT_PUBLIC_MARKETING_URL`. No copy.
- **Barrel** — `packages/email/src/components/index.ts:1-3` exports `StandardLayout`, `Button`, `Logo`.
- **Script** — `packages/email/scripts/notify-disconnected-integrations.ts:1-217`. One-shot Resend notifier for the `integration-disconnected` template; builds `subject`, `from`, `replyTo` strings at lines 35-36, 173, 195 (these subject strings are inside this package and ARE in scope).
- **Tailwind config** — `packages/email/tailwind.config.ts` (preview-server only; runtime theme is inline in `StandardLayout`).

#### 1.2 Wiring maturity (which templates are actually used) — **honest gap report**

`grep` of `@rox/email` consumers across `apps/**` + `packages/**`:

| Template | Consumer (file:line) | Status |
|---|---|---|
| `organization-invitation` | `packages/auth/src/server.ts:366` | **WIRED** |
| `member-added` | `packages/auth/src/server.ts:555` | **WIRED** |
| `member-removed` | `packages/auth/src/server.ts:571` | **WIRED** |
| `contact-inquiry` | `apps/marketing/src/app/contact/actions.ts:3` | **WIRED** |
| `enterprise-inquiry` | `apps/marketing/src/app/enterprise/actions.ts:3` | **WIRED** |
| `integration-disconnected` | `packages/email/scripts/notify-disconnected-integrations.ts:31` | **WIRED (script only)** |
| `welcome` | — none — | **STUB / unwired** |
| `subscription-started` | — none — | **STUB / unwired** |
| `subscription-cancelled` | — none — | **STUB / unwired** |
| `payment-failed` | — none — | **STUB / unwired** |
| `member-added-billing` | — none — | **STUB / unwired** |
| `member-removed-billing` | — none — | **STUB / unwired** |

So 6 of 12 are live; 6 are unrendered scaffolding. All translation work is template-internal copy; **subject lines for the 3 auth emails are built at the call site** (`packages/auth/src/server.ts:365,554,570`) and for marketing in the actions files — those are **out of WS-I scope** (owned by auth/marketing workstreams). WS-I §5 flags this as a coordination boundary.

#### 1.3 Stripe-removal context (coordinate with WS-E)

`packages/db/src/schema/economy.ts:4` states verbatim: *"The Rox economy replaces Stripe seat billing with a prepaid token economy"* (rox_balances seeded 500 Rox, rox_ledger, rox_topups via dv.net USDT, usage_requests). The legacy `subscriptions` Stripe table still exists (`packages/db/src/schema/schema.ts:289-326`, `stripe_customer_id`/`stripe_subscription_id`/`stripe_schedule_id`) but the product direction is token-economy, not seat billing.

The 5 billing/subscription templates are built entirely around **Stripe seat-billing concepts** that no longer apply:
- `subscription-started.tsx:43` `{amount}/{intervalText}`, `:46` seats, plan tiers.
- `subscription-cancelled.tsx:46-48` "moved to the free plan", resubscribe via `billingPortalUrl`.
- `payment-failed.tsx:32` "process the payment", `:55-66` card-failure reasons, billing portal.
- `member-added-billing.tsx:54-58` "Seats: N", "New monthly total", "prorated... next invoice".
- `member-removed-billing.tsx:54-63` "Seats", "monthly total", "credit... next invoice".

**Retire/keep/repurpose decision (WS-I recommendation, WS-E confirms):**

| Template | Verdict | Rationale |
|---|---|---|
| `subscription-started` | **REPURPOSE → `topup-confirmed`** (or RETIRE) | Closest token-economy analogue is "Rox top-up succeeded". If WS-E owns a top-up email, RETIRE here; else repurpose. |
| `payment-failed` | **REPURPOSE → `topup-failed`** (or RETIRE) | dv.net USDT invoice failure replaces card-decline. |
| `subscription-cancelled` | **RETIRE** | No subscription lifecycle in token model. |
| `member-added-billing` | **RETIRE** | Seat-count proration is gone. |
| `member-removed-billing` | **RETIRE** | Seat-count credit is gone. |
| `welcome` | **KEEP + translate + wire** (separate ticket for wiring) | Generic onboarding, locale-agnostic to billing; copy at `welcome.tsx:14-39`. |

Because all 5 are **unwired** (§1.2), retiring them is zero-blast-radius: no consumer breaks. WS-I will translate the survivors and **delete the retired files** ONLY after WS-E confirms it is not separately migrating them; default = keep files but mark `@deprecated` to honor the convergence rule "delete nothing" unless WS-E green-lights deletion. **Locked decision wins: UNIFY/keep; so default = translate-and-deprecate, not delete.**

#### 1.4 FULL verbatim copy of all 12 templates (source of truth for translation)

**welcome** (`welcome.tsx`): Preview "Welcome to Rox! Let's get you started." · H1 "Welcome to Rox, {userName}!" · "Thanks for joining Rox. We're excited to help you automate your workflows and boost your productivity with AI-powered task management." · "Here's what you can do next:" · "✓ Create your first workspace and invite your team" · "✓ Connect your favorite tools and integrations" · "✓ Set up your first automated workflow" · Button "Get Started" · "Need help getting started? Check out our documentation or reach out to our support team."

**organization-invitation** (`organization-invitation.tsx`): roleDisplay "Member"/"Admin" (`:24`) · Preview "{inviterName} invited you to join {organizationName}" · H1 "Join {organizationName} on Rox" · "Hi {inviteeName}," · "{inviterName} ({inviterEmail}) has invited you to join {organizationName} on Rox as a {roleDisplay}." · "Rox helps teams automate workflows, manage tasks, and collaborate effectively. Accept this invitation to get started." · Button "Accept Invitation" · "Or copy and paste this URL into your browser:" · "This invitation expires in {expirationText}. If you didn't expect this invitation, you can safely ignore this email." · expirationText "1 day"/"{n} days" (`:28-29`).

**member-added** (`member-added.tsx`): roleDisplay "Member"/"Admin"/"Owner" (`:19-20`) · Preview "You've been added to {organizationName}" · H1 "You're now part of {organizationName}" · "Hi {memberName}," · "{addedByName} has added you to {organizationName} on Rox as a {roleDisplay}." · "You now have access to the team's workspaces, tasks, and workflows. Head over to your dashboard to get started." · Button "Go to Dashboard" · "If you have any questions, reach out to {addedByName} or your team administrator."

**member-removed** (`member-removed.tsx`): Preview "You've been removed from {organizationName}" · H1 "You've been removed from {organizationName}" · "Hi {memberName}," · "{removedByName} has removed you from {organizationName} on Rox." · "You no longer have access to this organization's workspaces, tasks, or workflows." · "If you believe this was a mistake, please contact {removedByName} or your team administrator."

**member-added-billing** (`member-added-billing.tsx`): Preview "Billing update: {newMemberName} was added to {organizationName}" · H1 "New member added to {organizationName}" · "Hi {ownerName}," · "{addedByName} added a new member to {organizationName}:" · "{newMemberName}" / "{newMemberEmail}" · "Your subscription has been updated:" · "Seats: {newSeatCount}" · "New monthly total: {newMonthlyTotal}" · "The prorated amount will be reflected in your next invoice." · "You're receiving this because you're an owner of {organizationName}."

**member-removed-billing** (`member-removed-billing.tsx`): Preview "Billing update: {removedMemberName} was removed from {organizationName}" · H1 "Member removed from {organizationName}" · "Hi {ownerName}," · "{removedByName} removed a member from {organizationName}:" · "{removedMemberName}" / "{removedMemberEmail}" · "Your subscription has been updated:" · "Seats / New monthly total" · "A credit will be applied to your next invoice for the unused time." · "You're receiving this because you're an owner of {organizationName}."

**subscription-started** (`subscription-started.tsx`): intervalText "month"/"year" (`:21`) · Preview "Welcome to Rox {planName}!" · H1 "Welcome to Rox {planName}! 🎉" · "Hi {ownerName}," · "Thanks for upgrading {organizationName} to the {planName} plan. Your subscription is now active." · "Plan: {planName}" · "Billing: {amount}/{intervalText}" · "Seats: {seatCount}" · "With {planName}, you now have access to:" · "✓ Unlimited team members" · "✓ Advanced workflow automation" · "✓ Priority support" · "✓ And much more..." · "You're receiving this because you're an owner of {organizationName}."

**subscription-cancelled** (`subscription-cancelled.tsx`): formattedEndDate via `format(...,"MMMM d, yyyy")` (`:20`) · Preview "Your {planName} subscription has been cancelled" · H1 "Subscription cancelled" · "Hi {ownerName}," · "Your {planName} subscription for {organizationName} has been cancelled." · "Access until: {formattedEndDate}" · "You'll continue to have access to all {planName} features until {formattedEndDate}. After that, your organization will be moved to the free plan." · "Changed your mind? You can resubscribe anytime before your access ends." · Button "Resubscribe" · "We'd love to hear your feedback. Let us know why you cancelled so we can improve."

**payment-failed** (`payment-failed.tsx`): Preview "Payment failed for {organizationName}" · H1 "Payment failed" · "Hi {ownerName}," · "We were unable to process the payment of {amount} for {organizationName}'s {planName} subscription." · "Action required: Please update your payment method to avoid service interruption." · "We'll automatically retry the payment in a few days. To avoid any disruption, please update your payment method now." · "Common reasons for payment failure:" · "• Card expired or about to expire" · "• Insufficient funds" · "• Card blocked by your bank" · "• Incorrect billing information" · Button "Update Payment Method" · "Need help? Contact our support team and we'll get you sorted out."

**integration-disconnected** (`integration-disconnected.tsx`): Preview "A Rox integration was disconnected" · H1 "A Rox integration was disconnected" · "Hi {recipientName}," · "We found that multiple Rox organizations were connected to the same {provider/external} workspace, which caused webhook syncs to route non-deterministically between them. To fix it, we kept the most recently active org's connection and disconnected the rest." · "Your following connection(s) was/were disconnected:" (`:51-53`) · bullet "{orgName} → {provider} workspace {workspaceName} — now owned by {winnerEmail}" · "If your org should be the one connected, ask the listed owner to disconnect from their Rox Integrations page first, then reconnect from yours." · Button "Open Integrations" · "Reply to this email if you have questions." · provider literal type `"Linear" | "Slack"` (`:7`) — keep as-is (proper nouns).

**contact-inquiry** (`contact-inquiry.tsx`): **INTERNAL email** (no StandardLayout; goes to Rox team, not end user). Preview "Contact message from {name} ({email})" · H1 "New Contact Message" · "A new contact message was submitted from the marketing site." · labels Name/Email/Topic/Message.

**enterprise-inquiry** (`enterprise-inquiry.tsx`): **INTERNAL email** (no StandardLayout). Preview "Enterprise inquiry from {name} ({email})" · H1 "New Enterprise Inquiry" · "A new enterprise inquiry was submitted from the marketing site." · labels Name/Role/Company/Email/Phone/"What problem are they trying to solve?".

> Note: `contact-inquiry` & `enterprise-inquiry` are operational notifications to the **Rox founders inbox**, not customers. RU translation here is OPTIONAL/low-value; recommend translating for consistency since the team is RU-primary, but they are explicitly lower priority than customer-facing templates.

#### 1.5 i18n approach decision (inline RU vs i18n layer)

The repo's established localization pattern (`plans/ru-localization-inventory.md`) is **inline RU string replacement**, not a runtime i18n layer — Phase-1 desktop RU was done by hard-replacing English literals. No i18n library (`i18next`, `react-intl`) exists in `packages/email`. Email recipients have **no per-user locale field threaded** to the render call sites (the `react:` calls at `packages/auth/src/server.ts` pass no `locale`).

**Recommendation: inline RU replacement (single-locale)**, matching the desktop precedent and the RU-primary North Star. Rationale: (1) zero new deps, smallest diff, merges clean; (2) matches existing repo convention; (3) no locale plumbing exists to feed a bilingual layer, and adding it crosses workstream boundaries (auth/db). A future bilingual layer (English fallback for non-RU users) is a separate epic — out of WS-I scope. WS-I translates every template to RU inline and reuses the glossary in `plans/ru-localization-inventory.md`.

---

### 2. Target design

```
Render path (unchanged structure; only copy changes):

call site (OUT OF SCOPE)                packages/email/** (WS-I OWNS)
─────────────────────────              ─────────────────────────────
auth/server.ts ──react:──►  XxxEmail(props)  ──►  StandardLayout(preview=RU)
marketing actions ─────►    (RU H1/body/Button)        │
notify script ─────────►                               ├─ Logo (no copy)
                                                       ├─ <children> RU copy
                                                       └─ Footer (RU tagline + RU legal labels)
```

Glossary additions for email surface (extend `ru-localization-inventory.md` conventions, keep proper nouns as-is — `Rox`, `GitHub`, `Linear`, `Slack`, `PR`):

| English | Russian |
|---|---|
| Welcome to Rox, {x}! | Добро пожаловать в Rox, {x}! |
| Get Started | Начать |
| Accept Invitation | Принять приглашение |
| Go to Dashboard | Перейти в панель |
| Hi {x}, | Здравствуйте, {x}! |
| documentation / support team | документация / служба поддержки |
| workspaces, tasks, and workflows | рабочие пространства, задачи и процессы |
| You're now part of {org} | Теперь вы участник {org} |
| You've been removed from {org} | Вас удалили из {org} |
| Member / Admin / Owner | Участник / Администратор / Владелец |
| This invitation expires in {x} | Приглашение истекает через {x} |
| 1 day / {n} days | 1 день / {n} дн. |
| Open Integrations | Открыть интеграции |
| Reply to this email if you have questions. | Ответьте на это письмо, если есть вопросы. |
| All rights reserved. | Все права защищены. |
| Privacy / Terms / Contact | Конфиденциальность / Условия / Контакты |

Footer tagline RU (`Footer.tsx:69`): "Запускайте десятки агентов Claude Code, Codex и других параллельно."

---

### 3. Phase-2 implementation tasks (TDD-shaped, exact paths)

> **Test approach:** `packages/email` has no test runner today. Add a lightweight render-smoke test using `@react-email/render` (already transitively available via `react-email`/`@react-email/components`) under `packages/email/src/emails/__tests__/render.test.tsx`, run via root `bun test packages/email`. Each test renders a template to HTML and asserts (a) no throw, (b) a known RU substring is present, (c) no leftover English sentinel (e.g. asserts `Get Started` is ABSENT and `Начать` is PRESENT). This is the regression guard for translation completeness.

**Task I-1 — Render-smoke harness.** Create `packages/email/src/emails/__tests__/render.test.tsx`. For each of the 12 templates, import the component, `render(<Tpl/>)`, assert it returns a non-empty string and contains the template's expected RU heading. Establishes the gate before any copy edits (tests initially fail / written against target RU). Add `"test": "bun test"` to `packages/email/package.json` scripts if needed (within package, in scope).

**Task I-2 — Translate customer-facing wired templates.** Edit copy only (keep all props/imports/styles/classNames/hrefs/proper-nouns):
- `packages/email/src/emails/organization-invitation.tsx` (preview `:33`, H1 `:36`, body `:40-72`, roleDisplay `:24`, expirationText `:28-29`, Button `:57`).
- `packages/email/src/emails/member-added.tsx` (`:23-49`, roleDisplay `:19-20`, Button `:43`).
- `packages/email/src/emails/member-removed.tsx` (`:16-38`).
Expected behavior: RU strings render; I-1 assertions pass for these 3.

**Task I-3 — Translate `welcome.tsx` (keep; wiring is a separate ticket).** Edit `packages/email/src/emails/welcome.tsx:10-40` (preview, H1, body, 3 list items, Button "Get Started"→"Начать", footer doc/support links). Keep inline style objects.

**Task I-4 — Translate `integration-disconnected.tsx` + script subjects.** Edit `packages/email/src/emails/integration-disconnected.tsx:33-83` (preview, H1, body, pluralized "connection(s)" line `:51-53`, bullet template `:62-64` keep `{provider}`/`{workspaceName}`, closing line). Edit subject literals in `packages/email/scripts/notify-disconnected-integrations.ts:173` (`[TEST] ...`) and `:195` (`Your Rox integration was disconnected` → RU). Keep `FROM`/`REPLY_TO` (`:35-36`) and provider proper nouns.

**Task I-5 — Translate internal-notification templates (lower priority).** Edit `packages/email/src/emails/contact-inquiry.tsx:33-51` and `enterprise-inquiry.tsx:37-66` (H1, intro line, field labels). These are RU for the founders inbox.

**Task I-6 — Billing templates: deprecate + repurpose (coordinate WS-E).** Per §1.3, default = keep + mark `@deprecated` JSDoc (no deletion, honoring "delete nothing"):
- Add `/** @deprecated Stripe seat-billing retired in favor of the Rox token economy (packages/db/src/schema/economy.ts). Unwired. */` above the exported component in `subscription-cancelled.tsx`, `member-added-billing.tsx`, `member-removed-billing.tsx`.
- For `subscription-started.tsx` + `payment-failed.tsx`: translate to RU AND retarget copy to token-economy semantics ONLY if WS-E confirms it does not own top-up emails; otherwise mark `@deprecated`. Default until WS-E confirms: mark `@deprecated`, no copy retarget, no translation (avoid translating doomed copy).
Expected behavior: no consumer breaks (all unwired); typecheck stays green; I-1 smoke tests for these assert render-without-throw only (no RU-content assertion for deprecated-untranslated ones).

**Task I-7 — Footer + shared component copy.** Edit `packages/email/src/components/layout/StandardLayout/components/Footer/Footer.tsx:69` (tagline RU), `:75-93` legal link labels (Privacy/Terms/Contact → RU), `:98` "All rights reserved." → RU. `Button`/`Logo` have no copy — no change. Run I-1 to confirm footer RU appears in every rendered template.

**Task I-8 — README refresh.** Update `packages/email/README.md` to note RU-primary copy, the inline-RU convention, the deprecation of billing templates, and the new render-smoke test. Documentation only.

**Task I-9 — Final gate.** `bun run typecheck` (filter `@rox/email`) + `bun test packages/email` green; `bun run lint < /dev/null` clean for `packages/email/**`.

---

### 4. File ownership (WS-I owns/modifies in Phase 2 — merge isolation)

WS-I owns **`packages/email/**` only**. Exact files touched:
- `packages/email/src/emails/welcome.tsx`
- `packages/email/src/emails/organization-invitation.tsx`
- `packages/email/src/emails/member-added.tsx`
- `packages/email/src/emails/member-removed.tsx`
- `packages/email/src/emails/member-added-billing.tsx`
- `packages/email/src/emails/member-removed-billing.tsx`
- `packages/email/src/emails/subscription-started.tsx`
- `packages/email/src/emails/subscription-cancelled.tsx`
- `packages/email/src/emails/payment-failed.tsx`
- `packages/email/src/emails/integration-disconnected.tsx`
- `packages/email/src/emails/contact-inquiry.tsx`
- `packages/email/src/emails/enterprise-inquiry.tsx`
- `packages/email/src/components/layout/StandardLayout/components/Footer/Footer.tsx`
- `packages/email/scripts/notify-disconnected-integrations.ts` (only the subject/copy string literals at `:173`, `:195`)
- `packages/email/src/emails/__tests__/render.test.tsx` (NEW)
- `packages/email/package.json` (add `test` script only, if missing)
- `packages/email/README.md`

**Explicitly NOT owned (coordinate, do not edit):** email **subject lines** built at call sites — `packages/auth/src/server.ts:365,554,570` and `apps/marketing/src/app/contact/actions.ts` / `apps/marketing/src/app/enterprise/actions.ts`. Those belong to the auth/marketing workstreams. WS-I supplies the RU subject strings as a handoff note for those owners.

---

### 5. Dependencies + suggested wave

- **Depends on / coordinates with WS-E (Stripe removal / token economy):** Task I-6 verdict (translate-and-retarget vs deprecate) on `subscription-started` / `payment-failed` requires WS-E's confirmation of whether WS-E owns top-up emails. **Non-blocking:** default = deprecate-only, so WS-I can ship without waiting; if WS-E lands a top-up-email need, a fast follow re-targets those two files (still within `packages/email/**`).
- **Coordinates with (no file overlap) the auth + marketing workstreams** for the out-of-scope subject lines (§4). Handoff note only.
- **No code dependency on other workstreams** — `packages/email/**` is a leaf package; nothing else WS-I edits is shared.
- **Suggested wave: P1.** Not on the P0 critical path (host/convergence), but customer-facing and self-contained; safe to run in parallel with everything once WS-E's billing-direction note is available (a one-line confirmation, not a code dependency).

---

### 6. Target PR

- **Branch:** `ws-i/email-ru-translation-refresh`
- **PR title:** `feat(email): translate all transactional templates to Russian + retire Stripe-era billing emails`

---

### 7. Hardening review

> Read-only verification pass (Glob/Grep/Read) against the live code on branch `t/marketing-landing-publish-20260619`. Each major claim re-checked at the cited file:line. The spec is **factually strong**: every template's copy, every wiring claim, the env/schema context, and the file-ownership boundary all check out. Two material gaps in the §3 test plan are flagged below; they do not invalidate the design, only the harness mechanics.

#### 7(a) Factual corrections / refinements (file:line)

1. **Footer LinkedIn URL** (§1.1) — spec says `linkedin.com/company/agisota`; actual is `https://www.linkedin.com/company/agisota` (`Footer.tsx:53`). Cosmetic; the URL is not copy and is out of translation scope anyway. **Minor.**
2. **`integration-disconnected` bullet rendering** (§1.4) — spec quotes "now owned by {winnerEmail}"; the winnerEmail is actually a `mailto:` anchor (`integration-disconnected.tsx:62-64`), and the closing "Reply to this email…" line is at `:82` (spec's range `:33-83` covers it). Pluralized line is `:51-53` (verified). **Accurate, refine to mailto-anchor.**
3. **`payment-failed` conditional blocks** (§1.4) — the retry sentence and the "Update Payment Method" Button are **conditionally rendered** (`{nextRetryDate && …}` `:44`, `{billingPortalUrl && …}` `:68-72`), not always present. Same for **`subscription-cancelled`** "Resubscribe" Button (`{billingPortalUrl && …}` `:55-59`) and its feedback "Let us know" is a `mailto:support@rox.one` link (`:62-69`), not a plain sentence. A render-smoke test that asserts on Button copy must pass the gating prop, or those nodes won't render. **Material for I-1 assertions.**
4. **`subscription-started` prop name** (§1.4) — spec writes `intervalText "month"/"year" (:21)`; the *prop* is `billingInterval: "monthly" | "yearly"` (`:8`), and `intervalText` is the derived local at `:21`. Billing line `{amount}/{intervalText}` `:43`, Seats `:46` — both correct. **Minor naming.**
5. **`welcome` hrefs** (§1.4/I-3) — Button href is `https://app.rox.one/onboarding` (`:28`); doc/support links are `https://rox.one/docs` (`:32`) and `https://rox.one/support` (`:36`). Spec said "footer doc/support links" — confirmed; keep hrefs, translate only anchor text. **Accurate.**
6. **`@react-email/render` availability** (§3 / I-1) — spec claim "render already transitively available via `@react-email/components`" is **CORRECT and verified**: `@react-email/components@1.0.1` re-exports the entire `@react-email/render@2.0.0` module (`packages/email/node_modules/@react-email/components/dist/index.js:123-127`; physical pkg at `node_modules/.bun/@react-email+render@2.0.0`). So I-1 can `import { render } from "@react-email/components"` with no new dependency. **Confirmed — no correction needed.**
7. **economy.ts / Stripe table** (§1.3) — verbatim quote at `economy.ts:4` confirmed. Stripe `subscriptions` table confirmed (`schema.ts:290` table, `:298/:299/:311` stripe_* columns, `:325` type export); spec's range `289-326` is correct. **Accurate.**
8. **Auth subject lines** (§1.2/§4) — confirmed at `packages/auth/src/server.ts:365, :554, :570`; correctly flagged out-of-scope (call-site owned). **Accurate.**
9. **Wiring table** (§1.2) — re-grepped `@rox/email` consumers: exactly the 6 WIRED templates the spec lists (org-invitation/member-added/member-removed via `auth/server.ts:9-11`; contact/enterprise via `marketing actions:3`; integration-disconnected via the script). `WelcomeEmail` appears only in `README.md:119,123`; the 5 billing/subscription templates have **zero consumers**. **Fully accurate.**

#### 7(b) Open questions not fully answered by the spec

1. **`lib/env` render-time throw — BLOCKING for I-1 as written.** Every `StandardLayout`-based template imports `Footer` → `lib/env.ts:4` `createEnv(...)` with required `NEXT_PUBLIC_MARKETING_URL` (`env.ts:6,14`). Importing/rendering any of the 10 layout templates with that env var unset throws `Invalid environment variables` at module-eval time (reproduced: `bun -e` render of `welcome.tsx` threw exactly this). The §3 harness does not set it. **Fix:** the test must set `process.env.NEXT_PUBLIC_MARKETING_URL` (e.g. a `bunfig`/test preload or top-of-file assignment) before importing templates, OR the 2 internal templates (contact/enterprise-inquiry — no `env` import) are the only ones runnable without it. Without this, I-1 fails at import, not at assertion.
2. **WS-E owns no top-up email — resolves the I-6 ambiguity.** Grep of WS-E/WS-O specs found **no** `topup-confirmed`/`topup-failed`/top-up-email plan. So the §1.3/I-6 "coordinate with WS-E; repurpose if WS-E doesn't own top-up email" branch resolves to: **WS-E does not own it → default to deprecate-only**, and any future token-economy email belongs to WS-I (`packages/email/**`). The spec's default is correct; the coordination is effectively already answered (no blocker).
3. **`package.json` has no `test` script and no test runner config** (`packages/email/package.json:17-22` — only dev/export/clean/typecheck). I-1 correctly says to add `"test"`; note there is also no `vitest`/bun-test setup or `.test` glob today, so this is the package's first test. Confirm root `bun test packages/email` is the intended invocation (spec assumes it). **Minor — flagged, not blocking.**
4. **i18n decision is sound but un-cross-checked here.** Spec cites `plans/ru-localization-inventory.md` as precedent; that file was not opened in this pass (out of `packages/email/**` scope). Inline-RU recommendation is internally consistent and matches the no-locale-plumbing reality (auth call sites pass no `locale`). **Accept; unverified-by-this-pass dependency noted.**

#### 7(c) Merge-safety / file-ownership overlap check

Cross-checked WS-I's §4 owned-file list against **all 15 sibling specs** (WS-A…WS-O) in `plans/rox-convergence/`:

- **`rg -ln "packages/email"` across siblings → zero hits** outside `WS-I-spec.md`. No sibling lists `packages/email/**` or `@rox/email` as owned or modified. **No overlap.**
- **Schema boundary** — brief rule "schema owned by WS-O except `economy.ts`=WS-E" verified: `WS-O-spec.md:140` claims `schema/**` *except* `economy.ts`; `WS-E-spec.md:278` claims `economy.ts`. WS-I touches **no** schema file (only reads `economy.ts:4` as context in §1.3). **No conflict.**
- **`economy.ts` mentions in WS-A/B/F/G/H specs** are read-only context references (same as WS-I's), not edits — confirmed they appear in discussion, not ownership lists. **No write contention.**
- **Out-of-scope call sites** (`auth/server.ts`, marketing `actions.ts`) are correctly excluded from WS-I ownership (§4); those belong to the auth/marketing workstreams. **Boundary clean.**

**Verdict: no merge-overlap risk.** `packages/email/**` is a leaf, exclusively WS-I-owned. The only inter-WS touchpoint is the *informational* handoff of RU subject strings to auth/marketing owners (no shared file).

#### 7(d) Confidence per major claim

| Claim | Confidence | Basis |
|---|---|---|
| 12 templates' verbatim copy (§1.4) | **High** | Every template Read end-to-end; copy matches (with the §7(a) conditional-render nuances). |
| Wiring table: 6 wired / 6 stub (§1.2) | **High** | Re-grepped consumers; exact match incl. README-only `welcome`. |
| Layout/Footer/Button/Logo/env/colors inventory (§1.1) | **High** | All files Read; only the LinkedIn-URL nit. |
| Stripe-removal context + economy.ts quote (§1.3) | **High** | Verbatim quote + Stripe table columns verified. |
| File ownership = `packages/email/**` only, no overlap (§4) | **High** | All 15 sibling specs grepped; zero email-path collision. |
| `render` transitively available (§3/I-1) | **High** | Re-export chain + physical `.bun` pkg confirmed. |
| I-1 render-smoke harness will run as written | **Low** | Will throw at import without `NEXT_PUBLIC_MARKETING_URL`; §7(b)#1 must be fixed first. |
| Deprecate-vs-repurpose for subscription-started/payment-failed (I-6) | **Medium-High** | WS-E owns no top-up email → deprecate-only is the correct default; depends on WS-E not changing course. |
| i18n = inline-RU is the right call (§1.5) | **Medium** | Internally consistent; precedent file (`ru-localization-inventory.md`) not re-read this pass. |
