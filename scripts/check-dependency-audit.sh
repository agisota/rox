#!/bin/bash
# Dependency-vulnerability gate (FN-037 / issue #479).
#
# Runs `bun audit` and fails when the HIGH-severity advisory count climbs above a
# pinned baseline. The baseline is the known, triaged high count on `main`
# (documented in plans/2026-06-25-dependency-vulnerability-triage.md). The gate's
# job is NOT to drive the backlog to zero in one PR — many remaining highs are
# transitive through wrangler/undici, Expo, and Electron toolchains where a blind
# bump breaks the desktop/mobile builds. The gate exists so a NEW high (a fresh
# advisory or a newly-pulled vulnerable dep) trips CI instead of silently piling
# onto the backlog.
#
# Lower BASELINE_HIGH as remediation lands. When it reaches 0, flip the gate to a
# hard "any high fails" check by setting BASELINE_HIGH=0.
#
# Usage:
#   scripts/check-dependency-audit.sh            # gate on highs > baseline
#   BASELINE_HIGH=10 scripts/check-dependency-audit.sh
#
# Exit codes: 0 = at/under baseline, 1 = over baseline (or audit/tooling error).

set -euo pipefail

# Triaged high-severity baseline on main as of 2026-06-25 (post axios+ws override
# remediation). See the triage plan for the per-package exploitability notes.
BASELINE_HIGH="${BASELINE_HIGH:-22}"

audit_json="$(bun audit --json 2>/dev/null || true)"

if [ -z "$audit_json" ]; then
  echo "::error::bun audit produced no output (network or tooling failure)"
  exit 1
fi

# Count severities from the `{ "<pkg>": [ { "severity": ... }, ... ] }` shape.
counts="$(printf '%s' "$audit_json" | bun -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("parse-error");
      process.exit(2);
    }
    const sev = { critical: 0, high: 0, moderate: 0, low: 0 };
    for (const advisories of Object.values(data)) {
      if (!Array.isArray(advisories)) continue;
      for (const a of advisories) {
        const s = String(a.severity || "").toLowerCase();
        if (s in sev) sev[s] += 1;
      }
    }
    console.log(`${sev.critical} ${sev.high} ${sev.moderate} ${sev.low}`);
  });
')"

read -r CRITICAL HIGH MODERATE LOW <<<"$counts"

echo "bun audit — critical:$CRITICAL high:$HIGH moderate:$MODERATE low:$LOW (baseline high: $BASELINE_HIGH)"

# A critical advisory always fails, regardless of the high baseline.
if [ "${CRITICAL:-0}" -gt 0 ]; then
  echo "::error::$CRITICAL critical advisory(ies) present — must be remediated or waived before merge"
  exit 1
fi

if [ "${HIGH:-0}" -gt "$BASELINE_HIGH" ]; then
  echo "::error::high-severity advisories ($HIGH) exceed the triaged baseline ($BASELINE_HIGH)."
  echo "::error::A new high was introduced. Remediate it, or (if intentionally accepted) raise BASELINE_HIGH and document the waiver in plans/2026-06-25-dependency-vulnerability-triage.md."
  exit 1
fi

echo "Dependency audit gate passed (high $HIGH <= baseline $BASELINE_HIGH)."
