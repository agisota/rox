# Design Mode + Mobile View (Rox Desktop)

Status: in progress — Stages 1–3 (Browser pane reuse, Design Mode capture, agent
attachment) landing first. Stages 4–6 (mobile presets polish, iOS Simulator pane,
hardening) tracked below.

## Why this differs from the source spec

The integration spec proposes a parallel `apps/desktop/src/main/browser/`
subsystem (`BrowserSessionManager`, `ScreenshotService`, …) and a new
`browser.createSession`/`onSessionState` tRPC surface. Rox **already has** the
foundation the spec's Stage 1 describes, so building a parallel system would
violate the repo rule against duplicate pane/layout systems. Concretely, today's
codebase already provides:

- **Browser pane** — an Electron `<webview>` parked off-DOM and positioned over a
  placeholder by `browserRuntimeRegistry`
  (`renderer/.../usePaneRegistry/components/BrowserPane/`), registered through the
  generic `@rox/panes` registry. Persistence (`url`, `viewport`, history) already
  lives in the `ui-state` pane schema.
- **Main-process service** — `browserManager` (`main/lib/browser/browser-manager.ts`),
  an `EventEmitter` keyed by `paneId` exposing `getWebContents`, `evaluateJS`,
  `screenshot` (via `WebContents.capturePage`), console capture, and context menu.
- **tRPC router** — `browser.*` (`lib/trpc/routers/browser/browser.ts`) with
  observable subscriptions, the Rox-mandated pattern for trpc-electron.
- **Agent attachment** — the chat runtime `sendMessage({ content, files })` path
  already accepts image file attachments (`{ data, mediaType, filename }`).

So we **extend** these instead of replacing them. The spec's data contracts
(`DesignModeCapture`, `DevicePreset`) are honored verbatim as the wire/return
shapes.

### Decisions (ADR-style)

1. **Browser embedding:** keep the existing `<webview>` + off-DOM placeholder
   approach. It already gives isolated context (`partition="persist:rox"`, no Node
   integration in the guest), reliable `capturePage(rect)` cropping, and
   `executeJavaScript` injection — everything Design Mode needs.
2. **Design Mode capture transport:** main process drives capture. The renderer
   toggles design mode; an injected in-page script handles hover highlight and
   click selection purely guest-side (no per-frame host roundtrip, no layout
   shift). On click the script reports the hit point; `captureElement` then runs a
   one-shot serialization script via `browserManager.evaluateJS` and crops the
   screenshot with `WebContents.capturePage(rect)`.
3. **`attachCaptureToAgent` lives renderer-side.** Rox's proven agent-send path is
   the chat runtime `sendMessage` mutation in the renderer. Rather than duplicate
   that wiring in main (and risk drift), `captureElement` returns a full
   `DesignModeCapture` (incl. base64 screenshot + saved file path) and the pure
   `formatCaptureForAgent()` turns it into `{ markdown, file }` the renderer hands
   to the existing chat send. The contract from the spec is preserved; only the
   call site moves to where the integration already exists.
4. **Mobile viewport** uses `WebContents.enableDeviceEmulation` +
   `setUserAgent`, with touch emulation best-effort via the CDP debugger. Presets
   match the spec's `DevicePreset` shape and persist in the existing pane viewport
   field.
5. **iOS Simulator pane (Stage 5)** is macOS-only, platform-guarded at the router
   boundary, and deferred behind a feature flag. Non-macOS returns the spec's
   `iOS Simulator is available on macOS only` error without crashing.

## Layering

```
shared/browser/                         pure, unit-tested, no Electron imports
  types.ts            DevicePreset, DesignModeCapture, element descriptor
  schemas.ts          zod schemas (tRPC IO + runtime validation)
  devicePresets.ts    preset table + lookup
  cssWhitelist.ts     computed-style allowlist + filter
  htmlContext.ts      outerHTML/context truncation + size limits
  selectorHints.ts    stable selector synthesis from a serialized descriptor
  originPolicy.ts     local vs remote origin + capture-warning policy
  payloadLimits.ts    HTML / screenshot size limits
  sourcePath.ts       sourcemap path normalization within workspace root
  captureFormatter.ts DesignModeCapture -> { markdown, file } for the agent

main/lib/browser/
  browser-manager.ts            (extended) capturePageRegion, device emulation
  design-mode/
    pickerScript.ts             injectable hover+click overlay (guest-side string)
    serializeElementScript.ts   one-shot element serialization (guest-side string)
    designModeCaptureService.ts orchestration + in-memory capture store

lib/trpc/routers/browser/browser.ts     (extended) setDesignMode, setDevicePreset,
                                         captureElement, getCapture, onDesignEvent

renderer/.../BrowserPane/               (extended) toolbar toggle + preset select,
                                         capture preview + send-to-agent
```

## Security (spec §10) — enforced where

- Isolated guest: existing `<webview>` partition, no Node integration. ✔ existing
- No cookies/storage/auth in capture: serializer only reads DOM/computed CSS; never
  touches `document.cookie`/storage. ✔ `serializeElementScript`
- Remote-origin warning before send: `originPolicy.shouldWarnBeforeCapture`. ✔
- CSS allowlist mandatory: `cssWhitelist.filterComputedStyles`. ✔
- HTML ≤ 100 KB, screenshot ≤ 2 MB: `payloadLimits`. ✔
- Sourcemap paths normalized to workspace root; reads outside root rejected:
  `sourcePath.normalizeSourcePath` + `@rox/workspace-fs` containment. ✔
- No payload/secret content in logs: service logs only sizes/ids. ✔
- Screenshots in workspace-scoped temp, cleaned on cleanup. ✔

## Test plan mapping (spec §14)

Unit (pure, `bun test`): devicePresets validation, css whitelist serializer, html
truncation, selector generation, bounds/DPR, source-map path normalization, origin
policy, payload limits — all co-located `*.test.ts` here.

Renderer/integration tests and the iOS Simulator pane (Stage 5) follow in
subsequent PRs; the macOS-gated emulator suite is platform-guarded.
