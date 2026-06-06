# Agent-Controlled Browser Feature Plan

## Overview

Build a Codex-like agent-controlled browser for the desktop workspace. This is
not a greenfield browser: the repo already has a browser pane, a main-process
`BrowserManager`, screenshot capture, JavaScript evaluation, console capture,
and a desktop tRPC browser router. The feature work is to make that browser
safe and useful for agents: explicit settings, domain policy, structured
browser actions, compact snapshots, screenshots/receipts, and clear user
permission boundaries.

## Current Repo Surfaces

- `apps/desktop/src/main/lib/browser/browser-manager.ts`
  - Existing main-process registry from `paneId` to `webContentsId`.
  - Existing actions: `navigate`, `screenshot`, `evaluateJS`,
    `getConsoleLogs`, `openDevTools`.
  - Existing protections: new windows are denied and routed through an event.
- `apps/desktop/src/lib/trpc/routers/browser/browser.ts`
  - Existing desktop tRPC browser router for register/unregister/navigation.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/BrowserPane.tsx`
  - Current v2 browser pane and toolbar.
- `apps/desktop/src/renderer/stores/settings.ts`
  - Existing tiny settings store; likely not enough for browser policy.
- `packages/chat`, `packages/mcp`, `packages/mcp-v2`
  - Likely integration surface for exposing browser actions as agent tools.

There is also an older browser pane path under
`apps/desktop/src/renderer/screens/main/.../BrowserPane`. Before implementation,
confirm whether it is still active or legacy; do not update both by default.

## Product Shape

### User-Facing Settings

Add a `Settings > Browser` section with:

- Enable agent browser control.
- Clear browser data for the embedded browser session.
- Screenshot capture mode:
  - off
  - manual
  - always include for agent-visible receipts
- Confirmation mode:
  - ask before opening unknown domains
  - always allow
  - always ask
- Blocked domains.
- Allowed domains.

### Browser Tool Surface

Expose these agent actions behind policy checks:

- `browser.open({ paneId?, url })`
- `browser.snapshot({ paneId, interactiveOnly?: boolean })`
- `browser.click({ paneId, ref })`
- `browser.fill({ paneId, ref, value })`
- `browser.press({ paneId, key })`
- `browser.wait({ paneId, condition })`
- `browser.screenshot({ paneId })`
- `browser.getConsoleLogs({ paneId })`
- `browser.clearData()`

The model should never talk directly to Electron `webContents`; it should call
tools, and the app should validate policy before executing any action.

## Architecture Decisions

- Extend the existing `BrowserManager` rather than creating a second browser
  runtime.
- Enforce domain and permission policy in the main process, not only in React.
- Store user browser settings separately from transient pane runtime state.
- Use compact snapshot refs (`@e1`, `@e2`) for agent interaction instead of
  returning full HTML.
- Treat screenshots and page text as sensitive evidence; do not include them in
  agent context unless the setting allows it.
- Keep local dev verification on portless URLs such as `https://browser-demo.t`,
  not `localhost:<port>`.

## Dependency Graph

```text
Browser settings schema/store
  -> domain policy evaluator
    -> main-process BrowserManager enforcement
      -> tRPC browser action API
        -> agent tool adapter
          -> chat/agent runtime
            -> UI receipts and screenshots
```

## Task List

### Task 1: Browser Settings Contract

**Description:** Define the persistent settings shape for browser control,
domain rules, confirmation mode, screenshot mode, and data-clear metadata.

**Acceptance criteria:**
- [ ] Settings type includes enabled flag, confirmation mode, screenshot mode,
      allowed domains, blocked domains.
- [ ] Defaults are safe: browser control disabled or confirmation required for
      unknown external domains.
- [ ] Settings are testable without rendering the full desktop app.

**Verification:**
- [ ] Targeted unit test for default settings.
- [ ] `bun run typecheck`

**Dependencies:** None

**Files likely touched:**
- `apps/desktop/src/renderer/stores/settings.ts`
- Possibly a new browser-specific settings module under `apps/desktop/src/shared/`

**Estimated scope:** Small

### Task 2: Domain Policy Evaluator

**Description:** Add a pure policy function that decides whether a browser
action is allowed, blocked, or needs user confirmation.

**Acceptance criteria:**
- [ ] Blocked domains always deny.
- [ ] Allowed domains bypass confirmation.
- [ ] Unknown domains follow confirmation mode.
- [ ] Policy handles subdomains and invalid URLs explicitly.

**Verification:**
- [ ] Unit tests for exact domain, subdomain, invalid URL, allowed, blocked,
      and unknown-domain cases.
- [ ] `bun run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- New `apps/desktop/src/shared/browser-policy/` module

**Estimated scope:** Small

### Task 3: Main-Process Browser Guardrails

**Description:** Wire the policy into browser navigation and window-opening so
agent-driven navigation cannot bypass settings through direct tRPC calls.

**Acceptance criteria:**
- [ ] `BrowserManager.navigate` or its caller checks policy before `loadURL`.
- [ ] `setWindowOpenHandler` denies blocked domains and records attempted
      popup URLs.
- [ ] Agent actions cannot call `evaluateJS` unless browser control is enabled.
- [ ] Clear error responses distinguish `blocked`, `needs_confirmation`, and
      `no_web_contents`.

**Verification:**
- [ ] Targeted tests for policy result mapping where practical.
- [ ] Manual desktop smoke: blocked URL does not navigate.
- [ ] `bun run typecheck`

**Dependencies:** Tasks 1-2

**Files likely touched:**
- `apps/desktop/src/main/lib/browser/browser-manager.ts`
- `apps/desktop/src/lib/trpc/routers/browser/browser.ts`

**Estimated scope:** Medium

### Task 4: Compact Snapshot and Ref Registry

**Description:** Add an agent-readable page snapshot that returns a compact list
of visible interactive elements and stable refs for the next action.

**Acceptance criteria:**
- [ ] Snapshot returns page URL, title, visible text summary, and interactive
      refs.
- [ ] Refs are scoped to a pane and invalidated after navigation or refresh.
- [ ] Click/fill actions fail cleanly when refs are stale.
- [ ] Snapshot output avoids full raw HTML by default.

**Verification:**
- [ ] Unit test for snapshot result shape if implementation can run in jsdom.
- [ ] Manual smoke against a simple form page.
- [ ] Screenshot evidence for snapshot -> click/fill -> result flow.

**Dependencies:** Task 3

**Files likely touched:**
- `apps/desktop/src/main/lib/browser/browser-manager.ts`
- New `apps/desktop/src/main/lib/browser/browser-snapshot.ts`
- `apps/desktop/src/lib/trpc/routers/browser/browser.ts`

**Estimated scope:** Medium

### Task 5: Agent Tool Adapter

**Description:** Expose browser actions to the chat/agent runtime as tools,
mapping model requests to tRPC/browser manager calls and returning structured
receipts.

**Acceptance criteria:**
- [ ] Tools are only registered when browser control is enabled.
- [ ] Tool results include status, URL/title where relevant, and receipt ID.
- [ ] Screenshot payloads follow screenshot mode.
- [ ] Tool output never includes secrets or raw cookies.

**Verification:**
- [ ] Targeted test for tool registration gating.
- [ ] Agent smoke: prompt can open an allowed local page and request snapshot.
- [ ] `bun run typecheck`

**Dependencies:** Tasks 3-4

**Files likely touched:**
- `packages/chat`
- `packages/mcp` or `packages/mcp-v2`
- Desktop-side bridge where local tools are registered

**Estimated scope:** Medium

### Task 6: Settings UI

**Description:** Add a Browser settings page matching the existing settings
navigation style.

**Acceptance criteria:**
- [ ] Settings sidebar includes Browser or places it under Integrations/Permissions
      with a clear label.
- [ ] Toggle, confirmation mode, screenshot mode, clear-data action, allowlist,
      and blocklist are editable.
- [ ] Clear-data action calls the main process and reports success/failure.
- [ ] Text fits in compact desktop settings layouts.

**Verification:**
- [ ] Component/unit tests where existing settings pages have test patterns.
- [ ] Playwright/screenshot proof of settings page.
- [ ] `bun run lint`

**Dependencies:** Tasks 1-3

**Files likely touched:**
- `apps/desktop/src/renderer/routes/_authenticated/settings/layout.tsx`
- New settings route/components under
  `apps/desktop/src/renderer/routes/_authenticated/settings/browser/`
- `apps/desktop/src/lib/trpc/routers/browser/browser.ts`

**Estimated scope:** Medium

### Task 7: Receipts and Evidence

**Description:** Add durable local receipts for browser actions so users can
see what the agent opened, clicked, captured, and why a policy blocked an
action.

**Acceptance criteria:**
- [ ] Each agent browser action records an append-only receipt.
- [ ] Receipts include action type, URL/domain, policy result, timestamp, and
      optional screenshot reference.
- [ ] Receipts redact typed values for password-like fields.
- [ ] UI can show the recent browser action history for a pane/session.

**Verification:**
- [ ] Unit tests for redaction.
- [ ] Manual smoke produces visible receipts for open/snapshot/click/screenshot.

**Dependencies:** Tasks 4-5

**Files likely touched:**
- `apps/desktop/src/main/lib/browser/`
- Agent/chat session state modules
- Optional UI under browser pane overflow or agent run detail

**Estimated scope:** Medium

### Task 8: End-to-End Smoke and Hardening

**Description:** Prove the vertical slice with a local portless test app and a
real desktop/browser flow.

**Acceptance criteria:**
- [ ] Agent opens `https://browser-demo.t`.
- [ ] Agent snapshots the page, fills/clicks an allowed form, and records a
      receipt.
- [ ] Blocked domain attempt is denied and logged.
- [ ] Screenshot evidence is captured.
- [ ] Console logs are available without leaking cookies or local storage.

**Verification:**
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] Targeted browser-policy and browser-tool tests
- [ ] Playwright or desktop screenshot evidence for settings and browser flow

**Dependencies:** Tasks 1-7

**Files likely touched:**
- Test fixtures under the relevant app/package test directories
- `output/playwright/` only for local evidence, not committed unless project
  convention requires it

**Estimated scope:** Medium

## Checkpoints

### Checkpoint A: Policy Foundation

After Tasks 1-3:

- [ ] Browser settings contract exists.
- [ ] Policy evaluator is tested.
- [ ] Main-process navigation respects policy.
- [ ] Existing manual browser pane still works.

### Checkpoint B: Agent Control Slice

After Tasks 4-5:

- [ ] Agent can snapshot and act on a page through structured tools.
- [ ] Stale refs and blocked domains fail cleanly.
- [ ] Screenshot mode is respected.

### Checkpoint C: User-Visible Feature

After Tasks 6-8:

- [ ] Settings page controls behavior.
- [ ] Receipts show what happened.
- [ ] End-to-end smoke produces screenshot evidence.
- [ ] Typecheck/lint pass.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Agent bypasses UI settings through main-process tRPC | High | Enforce policy in main process before browser actions |
| Full HTML/screenshot leaks sensitive data into model context | High | Snapshot minimization, screenshot modes, redaction, receipts |
| Existing browser pane behavior regresses | Medium | Extend `BrowserManager`; preserve manual navigation path; test existing pane |
| Duplicate old/new browser pane paths cause split fixes | Medium | Confirm active v2 path before implementation; avoid editing legacy path unless needed |
| Ref registry becomes flaky on SPA rerenders | Medium | Invalidate refs on navigation/refresh/action; require re-snapshot |
| Domain matching is too permissive | High | Test exact host/subdomain rules; deny invalid URLs |

## Open Product Decisions

- Should browser control default to disabled or enabled-with-confirmation?
- Should screenshots be included automatically in agent context, or only stored
  as receipts until the user asks?
- Should `evaluateJS` be exposed to agents at all, or restricted to internal
  snapshot/action implementation?
- Should local development URLs be allowed as product input, or should agent
  flows require named/portless URLs only?

## Suggested Implementation Order

Start with Tasks 1-3 as the first vertical foundation slice. It creates value
even before agent tools: the existing browser pane becomes policy-aware and
settings-ready. Then implement Tasks 4-5 as the first agent-control slice.
Only after those are stable should the settings page and receipts be polished.
