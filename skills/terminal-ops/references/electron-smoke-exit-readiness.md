# Electron smoke readiness vs process exit

Session pattern captured from ROX/Craft Electron workbench verification.

## Symptom

Headless Electron smoke reaches readiness markers but the smoke command still fails after timeout:

```text
App initialized successfully
[smoke] Exit-on-ready requested; shutting down after successful startup
CRAFT_SERVER_URL=[REDACTED]
CRAFT_SERVER_TOKEN=[REDACTED]
[smoke] Electron startup timed out after 30000ms; escalated to SIGKILL after 5000ms grace
```

This means app initialization passed, but shutdown did not complete. Do not report the smoke as PASS just because readiness markers appeared.

## Fix pattern

In smoke-only shutdown paths, call `app.quit()` and add a bounded `app.exit(exitCode)` fallback after Electron has had a chance to run normal quit handlers:

```ts
setImmediate(() => {
  app.quit()
  setTimeout(() => app.exit(exitCode), 1_000).unref()
})
```

## Verification discipline

1. Save long gate output to a log with `tee`; redact server URL/token markers before reporting.
2. If the gate command is blocked/denied, do not retry the same command. Report the state as `blocked`, not `passed`.
3. A valid final verdict must distinguish:
   - readiness markers observed;
   - process exit verified;
   - command exit code `0` verified.
4. For generated logs/artifacts (`.ouroboros/`, `.claude/`, smoke logs), keep them out of staging unless explicitly requested.
