# Electron macOS branding and smoke verification

Session pattern: a macOS Electron repo looked fixed in packaged artifacts but still showed `Electron` when launched through dev/start scripts.

## Reusable diagnostic

1. Separate launch surfaces before declaring branding fixed:
   - packaged `.app` bundle (`*.app/Contents/Info.plist`);
   - helper app names under `Contents/Frameworks`;
   - root package scripts such as `electron:start` / `electron:dev`;
   - app-local package scripts such as `apps/electron/package.json:start`;
   - direct raw Electron commands (`electron .`, `electron apps/electron`).
2. Check packaged metadata directly:
   - `CFBundleDisplayName`
   - `CFBundleName`
   - `CFBundleExecutable`
   - `CFBundleIdentifier`
   - helper bundle names (`<Brand> Helper*.app`).
3. If packaged metadata is correct but macOS menu/Dock shows `Electron`, inspect start scripts for raw Electron launch. Raw `electron .` bypasses the branded `.app` wrapper and can surface generic Electron even when the packaged app is correct.
4. Route dev/start scripts through the repo's branded launcher/runtime builder instead of raw Electron. In this session the correct class of fix was: root/app `start` -> branded `scripts/electron-dev.ts`, which creates/opens a dev runtime `.app` named `ROX.ONE.app`.
5. Validate both surfaces after the patch:
   - packaged build/smoke;
   - dev/start launch screenshot or other UI proof.

## Smoke-test pitfall

Packaged Electron apps may route readiness logs to `electron-log` rather than stdout/stderr. A smoke script that requires a stdout marker such as `CRAFT_SERVER_URL=` can fail even though the app initialized cleanly. Treat this as a script assertion bug when logs show:

- server/listener initialized;
- `App initialized successfully`;
- smoke-mode clean shutdown;
- process exit code `0`.

Fix the smoke script to use clean exit as the readiness proof, with stdout markers as optional diagnostics, or read the app log explicitly.

## Evidence discipline

- Use screenshots/vision or Playwright evidence for UI-visible app names.
- If macOS automation/AppleScript is denied, do not retry the same denied command; switch to available screenshot/browser evidence.
- Keep runtime artifacts (`.ouroboros/`, logs, screenshots) out of git unless explicitly requested.
