# macOS Automation (Apple Events) permissions — implementation + handoff

## Problem
Rox only ever sent ONE Apple Event (`osascript → System Events` at startup), so
only "Rox → System Events" could appear in System Settings ▸ Privacy & Security ▸
Automation. The in-app "Автоматизация" button merely opened the settings pane and
sent no event, so it could neither register Rox nor grant any target. Finder,
Chrome, Terminal, Preview, Obsidian, PyCharm, Shortcuts were never targeted.

## Root cause (confirmed)
The Automation pane is data-driven: macOS creates a per-`(client, target)` row
**lazily**, the first time the client sends an Apple Event to that target (or
calls `AEDeterminePermissionToAutomateTarget`). There is no "register me" API.
Prerequisites (already satisfied in this repo):
- Entitlement `com.apple.security.automation.apple-events = <true/>` ✅
- Info.plist `NSAppleEventsUsageDescription` ✅
- Hardened runtime + `disable-library-validation` ✅

## Decision: osascript per-target (no native addon)
`node-mac-permissions@2.5.0` does **not** expose Apple Events (its `AuthType`
has no `apple-events`), so it cannot drive Automation. We reuse the already-proven
mechanism (the System Events trigger works today) and generalize it: send a
benign Apple Event (`tell application id "<bundleId>" to get its name`) per target
via `osascript`. `osascript` is spawned by the signed/hardened Rox binary, so TCC
attributes the request to Rox → the row is created as "Rox → <App>".

- **Automation = request-only.** macOS has no reliable read API for per-target
  Apple Events status without sending an event (which can launch a non-running
  target), so we expose per-target "Запросить доступ" buttons, not status badges.
  A future native helper calling `AEDeterminePermissionToAutomateTarget(false)`
  could add real status.
- **`bash` is NOT an Automation target** — shell execution isn't gated by
  `kTCCServiceAppleEvents`; it never appears in the pane. Intentionally omitted.
- **Shortcuts** uses the scripting host `com.apple.shortcuts.events`.
- **PyCharm** bundle id is edition-specific; CE (`com.jetbrains.pycharm.ce`) ships
  as default and can be made overridable later.

## Targets (`src/main/lib/automation-targets.ts`)
System Events, Finder, Shortcuts Events, Google Chrome, Terminal, Preview,
Obsidian, PyCharm.

## Files
- NEW `src/main/lib/automation-targets.ts` — target registry (single source).
- NEW `src/main/lib/automation-permission.ts` — `requestAutomationForTarget`,
  `requestAllAutomationTargets`, `assertKnownAutomationTarget` (darwin-guard +
  timeout + DI). Tests: `automation-permission.test.ts`.
- MOD `src/lib/trpc/routers/permissions/native-permissions.ts` — per-target
  `requestAutomation`, `requestAppleEvents` (now requests ALL targets),
  `openAutomationSettings`, `getAutomationTargets`, Screen Recording status.
- MOD `src/lib/trpc/routers/permissions.ts` — new tRPC procedures.
- MOD `PermissionsSettings.tsx` — per-target Automation list + "Запросить для
  всех" + Screen Recording row.
- MOD `electron-builder.ts` — add `NSSystemAdministrationUsageDescription`.
- Entitlements/plist: no change (apple-events already correct).

## Signing / notarization (env contract — plug in later)
Already wired in `electron-builder.ts` + `.github/workflows/build-desktop.yml`:

| Concern | Env var | Gate |
| --- | --- | --- |
| Signing identity | `CSC_LINK` + `CSC_KEY_PASSWORD` | `hardenedRuntime = Boolean(CSC_LINK)` |
| Notarization | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | `notarize = Boolean(APPLE_TEAM_ID)` |

No secrets are hardcoded. Provide the Developer ID cert + Team ID + Apple ID to
produce a signed, hardened, notarized build.

## Verification
Done here (no cert required): typecheck ✅, lint ✅, 41 unit tests ✅.

Requires the signed build (do after plugging in the cert):
1. `codesign -d --entitlements - Rox.app` shows `com.apple.security.automation.apple-events`.
2. Launch → Settings ▸ Разрешения ▸ Автоматизация → "Запросить доступ" on a
   target → "Rox wants to control <App>" dialog → accept → row appears under
   System Settings ▸ Privacy & Security ▸ Automation as "Rox → <App>".
3. `tccutil reset AppleEvents com.rox.one` resets; re-prompt works.
   NOTE: each re-sign invalidates existing Apple Events TCC records — keep a
   stable bundle id + Developer ID identity to minimize re-grant churn.

## Full TCC audit (state after this change)
| Permission | plist key | entitlement | Rox |
| --- | --- | --- | --- |
| Automation/AppleEvents | `NSAppleEventsUsageDescription` ✅ | `automation.apple-events` ✅ | per-target request ✅ |
| Microphone | `NSMicrophoneUsageDescription` ✅ | `device.audio-input` ✅ | status+request ✅ |
| Accessibility | none | none | status+request ✅ |
| Full Disk Access | `NSSystemAdministrationUsageDescription` ✅ (added) | none | status+request ✅ |
| Screen Recording | none | none | status+open-settings ✅ (added) |
| Local Network | `NSLocalNetworkUsageDescription` ✅ | none | request ✅ |
| Camera | `NSCameraUsageDescription` (add if used) | `device.camera` (add if used) | n/a (not used) |
| Input Monitoring | none | none | not surfaced (add if needed) |
