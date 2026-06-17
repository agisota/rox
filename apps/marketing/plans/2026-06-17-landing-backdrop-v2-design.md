# Landing Backdrop v2 — ambient-depth Rox UI

**Date:** 2026-06-17 · **Status:** validated (brainstorming) → implementing
**Scope:** `apps/marketing` landing (rox.one), `LandingBackdrop` component.

## Decision (from brainstorming)

- **Topic:** make the 3D app mockup a stronger visual on the landing.
- **Content:** stylized **vector** Rox UI (no real screenshots).
- **Composition:** **ambient depth** — keep the centered scramble hero/text
  unchanged; upgrade the existing `LandingBackdrop` to be more present + sharper.
  No hero restructure (lowest risk).
- **Tech:** keep **CSS-3D** (R3F is overkill for a backdrop; perf + the
  component already exists).

## Goals

1. **More present, still legible.** Raise the layer presence (opacity ~0.4 →
   ~0.58; mobile 0.22 → 0.3) and add a legibility scrim *behind the centered
   text column* so the headline/features never fight the backdrop.
2. **Recognizable Rox UI.** Upgrade the desktop window to read as Rox:
   - a row of **parallel-agent tabs** (one active, orange) — the core product
     story,
   - the existing sidebar (workspaces/agents, orange active item) + code/diff
     lines,
   - a **terminal strip** at the bottom (Rox's terminal),
   - phone keeps the compact chat/agent UI.
3. **Premium depth.** Keep the perspective rig (desktop tilted back, phone
   forward/overlapping), layered shadows, soft orange key-light, vignette,
   pointer parallax. Tune for a Spline-like float. Respect
   `prefers-reduced-motion`.

## Files

- `…/LandingBackdrop/LandingBackdrop.tsx` — add agent-tab row + terminal strip markup.
- `…/LandingBackdrop/LandingBackdrop.module.css` — tabs/terminal styles, opacity, depth polish.
- `…/landing-experience.css` — soft scrim behind `.rox-landing__main` (legibility).

## Legibility guard

Centered text column (≤680px) gets a soft dark radial halo behind it (over the
backdrop) so white copy stays crisp regardless of the brighter rig.

## Verify

- Playwright desktop (1440) + mobile (390): backdrop clearly present **and**
  hero text fully legible (visual review).
- `biome` ✓ · `tsc --noEmit` ✓.
- PR → Vercel preview for review before prod.
