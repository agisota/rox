# Rox Design Language

The visual-structure contract for Rox surfaces (web · desktop · mobile shells).
Companion to [`MOTION-LANGUAGE.md`](./MOTION-LANGUAGE.md): motion governs how
things move, this governs how they sit, separate, and read. The machine-readable
token source is [`../globals.css`](../globals.css) (OKLCH semantic CSS vars).

> **Calm developer console.** The aesthetic target is Linear/Vercel precision:
> a quiet, information-dense surface where the conversation is loud and the
> chrome is silent. Structure comes from hairlines and spacing, not decoration.

---

## First principles

1. **Structure via hairline borders, not shadows.** Separate regions with
   1px borders (`--border` / `--sidebar-border`), not drop shadows. Shadows are
   reserved for genuinely-floating layers (popovers, dialogs, dragged items) and
   for the glass specular rim (see `.glass-panel` in `globals.css`). A flat,
   bordered surface is the default.
2. **One accent at a time.** A view has a single active accent (`--primary`, or
   a scoped `--workspace-accent` / persona accent). Never stack multiple
   saturated colors competing for attention. Semantic colors
   (`--info`/`--success`/`--warning`/`--destructive`) are status signals, not
   decoration — at most one is visible per row/region.
3. **Conversation primary, chrome quiet.** The center canvas carries full
   contrast (`--foreground` on `--background`). Rails, sidebars, and toolbars
   recede (`--muted-foreground`, `--sidebar` surfaces). Quiet chrome makes the
   content the figure and the frame the ground.
4. **Tight, predictable spacing.** Use the 4-step scale only: **4 / 8 / 12 /
   16** (px). Intra-component padding starts at 4–8; component gaps 8–12;
   region gaps 12–16. Do not invent in-between values.
5. **Radius is a scale, not a vibe.** Use the four radii only: **4 / 8 / 12 /
   999**. Derive from the `--radius-*` tokens (`--radius-sm`/`-md`/`-lg`/`-xl`
   off the `0.625rem` base). `999` (full) is the pill — see below.
6. **Pill shape ONLY for true chips.** `rounded-full` / radius `999` is reserved
   for tags, filter pills, status badges, and avatar shapes — small, atomic,
   token-like objects. Buttons, inputs, cards, and panels use the 4/8/12 radii.
7. **No nested rounded rectangles.** A rounded container does not hold another
   visibly-rounded container at the same edge. Inner elements go square (or
   borderless) so corners never double up. One radius per nesting boundary.

---

## Semantic color tokens

OKLCH semantic vars defined for both `:root` (light) and `.dark`, registered in
the `@theme inline` map and consumable as Tailwind utilities
(`bg-info`, `text-success-foreground`, …). Each ships a `*-foreground` pair for
legible text/iconography on the fill. Use them for **state**, never for brand
decoration.

| Token | Use when | Example surface |
|---|---|---|
| `--info` / `--info-foreground` | neutral information, in-progress, hints | info banner, "syncing" pill, tips |
| `--success` / `--success-foreground` | completion, healthy, verified, online | "saved" toast, green presence dot, passing check |
| `--warning` / `--warning-foreground` | caution, degraded, needs-attention (non-fatal) | rate-limit notice, unsaved-changes badge |
| `--destructive` | errors, irreversible/danger actions | delete button, failed run, error toast |

Rules:

- These four are mutually exclusive per element — show the single most relevant
  state, not a rainbow.
- Always pair a fill with its `-foreground` for text/icons; never put
  `--foreground` directly on a semantic fill.
- They are **status**, not accent. The active-view accent stays `--primary` /
  workspace / persona accent (orthogonal to status — see Motion Language's
  governor note on layered, independent CSS-var layers).
- Existing run-state tokens (`--state-transition` / `--state-verified` /
  `--state-noise`) remain the canvas/worklog vocabulary; the semantic four are
  the UI-chrome status vocabulary. Don't cross them.

---

## Quick reference

```
borders   → 1px, --border / --sidebar-border        (not shadows)
shadows   → floating layers + glass rim only
accent    → exactly one active (--primary / --workspace-accent / persona)
spacing   → 4 / 8 / 12 / 16                          (no in-betweens)
radius    → 4 / 8 / 12 / 999  (--radius-sm/-md/-lg/-xl; 999 = pill)
pill      → true chips only (tags, filter pills, status badges, avatars)
nesting   → never double a rounded corner; one radius per boundary
status    → --info / --success / --warning / --destructive (one at a time)
contrast  → loud center canvas, quiet chrome
```
