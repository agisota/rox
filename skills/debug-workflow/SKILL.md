---
triggers:
  - "deuug workflow"
name: debug-workflow
description: Global Debugging agent skill for AG
---

## The Five Phases

You MUST complete each phase before proceeding to the next.

### Phase 0: Start Debug Session Logging

**FIRST: Initialize structured logging for retrospective analysis**

If `.debug-logs/helpers/start-debug-session.ps1` exists in the project:

```powershell
# Start a debug session (creates hourly log folder)
. .debug-logs/helpers/start-debug-session.ps1 -Issue "Brief description" -Revision "revision-name"

# This exports helper functions:
# - Log-Command "command"            → Log commands to commands-run.txt
# - Log-Error "error message"        → Log errors to errors-found.txt
# - Log-Fix "solution" -Commit "sha" → Log fixes to fixes-applied.txt
# - Fetch-CloudLogs -Revision "..."  → Fetch and log Cloud Run logs
# - End-DebugSession -Resolution "" → Close session with summary
```

**Use throughout debugging:**
- Log errors as you find them: `Log-Error "SyntaxError: Unexpected token '}'"`
- Log commands: `Log-Command "gcloud logging read ..."`
- Log fixes: `Log-Fix "Removed extra closing brace" -Commit "c6b8ebd"`
- End session: `End-DebugSession -Resolution "Fixed syntax error in iracingAuth.js"`

**Benefits:**
- Automatic timestamped logs in `.debug-logs/sessions/YYYY-MM-DD-HH/`
- Retrospective analysis: "What pattern caused this?"
- Time-to-resolution tracking
- Reusable solutions database

---

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
